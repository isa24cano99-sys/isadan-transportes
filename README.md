This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

---

## Base de datos y migraciones

**La fuente de verdad del esquema es `supabase/migrations/`.** No se aplican cambios
de esquema a mano en el panel de Supabase. Los bloques SQL que quedan en comentarios
dentro de algunos `actions.ts` están marcados como **HISTÓRICO** y no deben ejecutarse.

La CLI se usa vía `npx` (no requiere instalación global):

```bash
npx supabase --version
```

### Generar el baseline (una sola vez)

El baseline captura el esquema actual de producción (28 tablas, 8 enums, FKs, índices,
columnas generadas como `accounts_receivable_entries.balance`). Requiere el **password de
la base de datos** (Supabase → Project Settings → Database), que **queda solo en tu máquina**:

```bash
# 1. Autenticarse (abre el navegador, guarda un access token local)
npx supabase login

# 2. Linkear este repo con el proyecto (ref ya está en supabase/config.toml)
npx supabase link --project-ref mykfkltwecslxqsxrkwn

# 3. Traer el esquema de producción como migración baseline
npx supabase db pull
#    → crea supabase/migrations/<timestamp>_remote_schema.sql
```

### Verificar el baseline (reproduce producción en una base limpia)

```bash
npx supabase start                 # levanta Postgres local + aplica migraciones
npx supabase db diff --linked      # debe salir VACÍO: local == producción
```
Si `db diff` reporta diferencias, el baseline no es fiel — revisar antes de continuar.

### Cambios de esquema de aquí en adelante

```bash
npx supabase migration new <nombre>   # crea un .sql versionado en supabase/migrations/
# ...editar el .sql con el DDL...
npx supabase db push                  # aplica a producción (o correr el SQL en el panel y luego db pull)
```

> Notas: `supabase/config.toml` y `supabase/migrations/` **sí** se versionan; `supabase/.temp`,
> `.branches` y los `.env*` están en `supabase/.gitignore`. Nunca commitear el password de la DB.

---

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
