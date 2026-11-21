'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** Enlace del menú que se marca como página actual (aria-current) según la ruta. */
export function EnlaceNav({ href, children }: { href: string; children: React.ReactNode }) {
  const ruta = usePathname();
  const actual = ruta === href || ruta.startsWith(`${href}/`);
  return (
    <Link href={href} aria-current={actual ? 'page' : undefined}>
      {children}
    </Link>
  );
}
