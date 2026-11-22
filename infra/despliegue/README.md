# Despliegue en producción (Fase K)

Cómo poner HallazGO UD en un servidor propio (VPS) con HTTPS. Todo lo de esta guía se probó en un PC con Docker el 2026-11-21 (sección 9); lo único que no se pudo probar es lo que necesita el servidor real: el dominio, el certificado de Let's Encrypt y el cron.

```
Internet ──443──► Caddy (HTTPS) ──► frontend (Next) ──/api──► backend (Nest) ──► PostgreSQL, SeaweedFS, SMTP
```

Solo Caddy publica puertos (80 y 443). La base de datos, el almacenamiento de imágenes, el backend y el frontend **no** son alcanzables desde Internet.

## 1. Lo que necesitas

| Qué | Recomendado |
|---|---|
| Servidor (VPS) | Ubuntu 24.04 LTS, 2 vCPU, 4 GB de RAM, 40 GB de disco |
| Dominio | Uno que puedas apuntar al servidor (por ejemplo `hallazgo.udistrital.edu.co`) |
| Correo saliente | Un SMTP real con usuario y clave (el de la universidad, Brevo, Amazon SES…). Sin esto no salen los correos de activación |
| Copia fuera del servidor | Otro lugar donde guardar los respaldos (Google Drive, otro servidor, un bucket S3) |

## 2. Preparar el servidor (una vez)

```bash
# Usuario propio (no trabajar como root) con acceso por llave SSH
adduser hallazgo && usermod -aG sudo hallazgo

# Cortafuegos: solo SSH, HTTP y HTTPS
sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable

# Actualizaciones de seguridad automáticas
sudo apt install -y unattended-upgrades

# Docker Engine + Compose: seguir la guía oficial para Ubuntu
#   https://docs.docker.com/engine/install/ubuntu/
sudo usermod -aG docker hallazgo   # (cerrar sesión y volver a entrar)
```

**Ojo con el cortafuegos y Docker:** Docker abre sus puertos por su cuenta, aunque `ufw` diga otra cosa. Por eso en `docker-compose.prod.yml` **solo Caddy tiene `ports`**: es la verdadera protección.

## 3. Dominio

En el proveedor del dominio, crea un registro **A** que apunte `hallazgo.tudominio` a la IP del servidor. Compruébalo con `nslookup hallazgo.tudominio` antes de seguir: Caddy necesita que el dominio ya apunte al servidor para sacar el certificado.

## 4. Código y variables

```bash
git clone https://github.com/WalterS255/HallazGOUD.git hallazgo && cd hallazgo
cp .env.prod.example .env.prod
chmod 600 .env.prod                   # solo tu usuario puede leerlo
openssl rand -base64 48               # repite para cada clave: POSTGRES_PASSWORD, CLAVE_APP_BD, JWT_SECRET, S3_*
nano .env.prod                        # DOMINIO, claves y el SMTP real
```

Con `NODE_ENV=production`, el backend **se niega a arrancar** si encuentra un valor de ejemplo ("cambia-esto") o `SIN_LIMITE_PETICIONES=true`.

## 5. Levantar

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
```

Orden automático: base sana → **migraciones** (como dueño de las tablas) → **rol `hallazgo_app`** (permisos mínimos) → backend → frontend → Caddy. `migrar` y `rol-app` terminan con "Exited (0)": es lo normal. El primer arranque tarda unos minutos (compila las imágenes y Caddy saca el certificado).

## 6. Primeros datos

**Catálogos** (categorías, sedes y lugares), **sin** las cuentas de prueba:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm \
  -e SOLO_CATALOGOS=true \
  -e DATABASE_URL="postgresql://<POSTGRES_USER>:<POSTGRES_PASSWORD>@db:5432/<POSTGRES_DB>" \
  migrar npx prisma db seed
```

**Primer administrador:** regístrate en `https://tu-dominio/registro` con tu correo institucional, actívalo con el enlace del correo y luego:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod exec db \
  psql -U <POSTGRES_USER> -d <POSTGRES_DB> -c "UPDATE usuario SET rol = 'ADMIN' WHERE lower(correo) = 'tu.correo@udistrital.edu.co'"
```

Desde ahí, ese admin gestiona catálogos y cuentas desde `/admin`. Los moderadores se nombran igual, con `rol = 'MODERADOR'`.

## 7. Respaldos (RNF-12: diarios, 30 días)

```bash
crontab -e
# Todos los días a las 4:00 a. m. (después de la expiración, 3:00, y la limpieza de fotos, 3:30):
0 4 * * * cd /home/hallazgo/hallazgo && ARCHIVO_ENV=.env.prod bash infra/respaldo/respaldar.sh >> respaldos/respaldo.log 2>&1
```

**Copia fuera del servidor** (si el servidor se pierde, los respaldos que estaban en él también). Por ejemplo, con [rclone](https://rclone.org) configurado contra Google Drive, a las 4:30:

```bash
30 4 * * * rclone copy /home/hallazgo/hallazgo/respaldos drive:hallazgo-respaldos --max-age 2d
```

**Una vez al mes, prueba que el respaldo sirve** (restaura en una base aparte; no toca la real):

```bash
ARCHIVO_ENV=.env.prod bash infra/respaldo/restaurar.sh respaldos/<el más reciente>.dump
```

Las fotos (SeaweedFS) están en el volumen `hallazgo-prod_s3_datos`. Para respaldarlas: `docker run --rm -v hallazgo-prod_s3_datos:/datos -v $PWD/respaldos:/r alpine tar czf /r/fotos_$(date +%F).tgz -C /datos .`

## 8. Actualizar a una versión nueva

```bash
ARCHIVO_ENV=.env.prod bash infra/respaldo/respaldar.sh      # primero, un respaldo
git pull
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

Las migraciones nuevas se aplican solas (servicio `migrar`) y `rol-app` da permisos a las tablas nuevas. **Volver atrás:** `git checkout <versión anterior>` y el mismo `up -d --build`. Si la versión nueva cambió la base, además restaurar el respaldo de antes de actualizar.

**Ver qué pasa:** `docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f backend` (en producción, una línea JSON por petición, con `X-Request-Id`).

## 9. Lo que se probó en local (2026-11-21)

Con `DOMINIO=localhost` y los puertos 8080/8443 (en el PC, 80 y 443 estaban ocupados: `PUERTO_HTTP` y `PUERTO_HTTPS`):

| Qué | Resultado |
|---|---|
| Arranque ordenado | db → migrar (0) → rol-app (0) → backend (sano) → frontend (sano) → caddy |
| HTTPS | Página y API por Caddy: 200; `http` → 308 a `https`; HSTS; sin encabezado `Server` |
| Puertos | Solo Caddy publica puertos |
| Usuario de BD | El backend entra como `hallazgo_app`, que **no puede**: `DROP TABLE`, crear tablas, borrar ni modificar la auditoría, desactivar su trigger, leer `_prisma_migrations` |
| IP real | 7 logins con IP inventada a través de Caddy → el 6.º da 429 |
| Arranque del backend | Crea el bucket si falta; programa la expiración (3:00) y la limpieza de fotos (3:30) |
| Playwright contra producción | **48 de 48** por HTTPS (`E2E_URL=https://localhost:8443 npm run test:e2e`) |
| Respaldo y restauración | Mismas filas en cada tabla, 3 triggers y 22 CHECK |
| OWASP ZAP (pasivo) contra la compilación de producción | 0 fallos; desaparecen los avisos propios del modo desarrollo (`unsafe-eval`, paquetes sin minificar) |
| Seed `SOLO_CATALOGOS` en una base nueva | 8 categorías, 8 sedes, 22 lugares, **0 usuarios** |

## 10. Antes de abrirlo al público

- [ ] `.env.prod` con claves nuevas (ninguna "cambia-esto") y `chmod 600`.
- [ ] El certificado es de Let's Encrypt (candado sin advertencias en el navegador).
- [ ] Llega el correo de activación (SMTP real).
- [ ] El cron de respaldos corrió al menos una vez y hay copia fuera del servidor.
- [ ] Solo los puertos 22, 80 y 443 responden desde fuera (`nmap tu-dominio` desde otro equipo).
- [ ] **Límite de peticiones y la red de la universidad:** el límite general es de 100 peticiones por minuto **por IP**. Si el campus sale a Internet por una sola IP (NAT), todos los estudiantes conectados al Wi-Fi compartirían ese límite. Revisar con la oficina de redes; si es así, subir el límite general en `backend/src/comun/limites/limites.ts` (el de login, 5 por minuto, conviene dejarlo).
- [ ] Manuales publicados para usuarios y administradores (`docs/manual-usuario.md`, `docs/manual-administrador.md`).
