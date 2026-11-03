# Configuración de Supabase

Proyecto indicado: `dpdtgpruudcqhebzcypq`.
URL pública: `https://dpdtgpruudcqhebzcypq.supabase.co`.

Verificado el 2026-11-02: acceso de la CLI y vínculo local completados;
migraciones `001`–`003` aplicadas. Las 47 tablas de `public` tienen RLS y no
conceden privilegios a `anon` ni `authenticated`. El trigger de auditoría está
activo y los checksums coinciden con el código local. La aplicación aún no está
desplegada en Vercel; ver [estado y pendientes](../STATUS.md).

Desde la raíz del repositorio:

```sh
supabase login
supabase link --project-ref dpdtgpruudcqhebzcypq
```

La cuenta autenticada debe tener acceso a ese proyecto. `supabase init` crea
la configuración local; `supabase link` no crea las tablas de la aplicación.
La configuración de `config.toml` corresponde al entorno local y no acredita
que Auth, Storage o la base remota estén configurados.

Las migraciones de esta aplicación siguen en `apps/api/migrations` y se aplican
con `npm run db:migrate`, usando `DIRECT_DATABASE_URL` y las instrucciones de
[configuración del backend](../apps/api/README.md). El ejecutor conserva sus
checksums en `schema_migrations`. `supabase db push` no aplica esas migraciones;
no mantener una segunda copia de ellas dentro de esta carpeta.

Las credenciales pertenecen a `apps/api/.env` o al gestor de secretos del
hosting. `.temp` y `.branches` son archivos locales ignorados por Git.
El token personal de administración se guarda en el `.env` de la raíz,
ignorado por Git; no es una variable del frontend ni una credencial de ejecución
del backend. El acceso se completó con Supabase CLI 3.0.0.
