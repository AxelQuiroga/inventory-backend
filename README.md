# Inventory Backend

Backend de un sistema web de gestión de inventario desarrollado como proyecto **Full-Stack End-to-End**.

El sistema busca resolver la necesidad de pequeñas y medianas empresas de mantener un control confiable del inventario, registrar entradas y salidas de mercadería y mantener trazabilidad sobre las operaciones realizadas.

## 🎯 Objetivo

El backend proporciona una API REST para gestionar:

* Usuarios y autenticación.
* Productos.
* Stock.
* Entradas de mercadería.
* Salidas de mercadería.
* Historial de movimientos.
* Alertas de stock bajo.
* Roles y permisos.

Una regla fundamental del sistema es que **el stock no se modifica directamente**. Las modificaciones de stock deben realizarse mediante operaciones de entrada o salida, generando siempre el movimiento correspondiente.

## 🛠️ Tecnologías

* Node.js
* TypeScript
* Fastify
* PostgreSQL
* Zod
* JWT
* Docker
* Docker Compose

> ORM: Drizzle.

## 🏗️ Arquitectura

El proyecto busca mantener una separación clara entre las responsabilidades del sistema.

```text
HTTP Request
     │
     ▼
   Routes
     │
     ▼
 Controllers
     │
     ▼
 Use Cases
     │
     ▼
   Domain
     │
     ▼
 Repositories
     │
     ▼
 PostgreSQL
```

La lógica de negocio no debería depender directamente de Fastify ni de PostgreSQL.

## 📦 Funcionalidades principales

### Autenticación

* Registro de usuarios.
* Inicio de sesión.
* Autenticación mediante JWT.
* Control de acceso basado en roles.

### Productos

* Crear productos.
* Consultar productos.
* Buscar y filtrar productos.
* Actualizar información de productos.
* Desactivación lógica (`POST /products/:id/deactivate` + `reactivate`) — la Regla 7 del dominio prefiere desactivar antes que eliminar, preservando el historial.
* Consultar productos con stock bajo.

### Inventario

* Registrar entrada de stock.
* Registrar salida de stock.
* Consultar stock actual.
* Consultar historial de movimientos.

### Auditoría

Cada modificación del stock genera un movimiento asociado al usuario que realizó la operación.

Los movimientos históricos son inmutables.

## 🧠 Reglas de negocio

Entre las principales reglas del dominio:

1. El stock no puede ser negativo.
2. Las cantidades de entrada y salida deben ser mayores que cero.
3. El SKU de un producto debe ser único.
4. El stock solo puede modificarse mediante operaciones de inventario.
5. Cada entrada o salida genera un movimiento.
6. Los movimientos históricos no pueden modificarse ni eliminarse.
7. Un producto inactivo no puede recibir nuevos movimientos.
8. Las operaciones de stock deben mantener la consistencia entre el stock y su historial.
9. Las operaciones críticas deben ejecutarse de forma atómica.
10. Las acciones disponibles dependen del rol del usuario.

## 📁 Estructura

```text
src/
├── domain/
│   ├── entities/        # Product, User, Movement + enums
│   └── interfaces/      # Contratos de repositorios (sin Drizzle)
├── application/         # Casos de uso (lógica de negocio)
├── infrastructure/
│   ├── database/        # Drizzle, conexión, schema, seed
│   ├── repositories/    # Implementaciones (únicos que importan Drizzle)
│   └── auth/            # JwtService
├── presentation/
│   ├── schemas/         # Schemas Zod
│   ├── controllers/     # Validación con safeParse
│   ├── routes/          # DI + registro de rutas
│   └── middleware/      # authenticate, authorize
└── index.ts

Tests (Vitest): co-located junto al código — `src/**/*.test.ts`
```

La estructura podrá evolucionar durante el desarrollo a medida que aparezcan nuevas necesidades.

## 🚀 Instalación

Clonar el repositorio:

```bash
git clone <repository-url>
cd inventory-backend
```

Instalar dependencias:

```bash
npm install
```

Crear las variables de entorno a partir del archivo de ejemplo:

```bash
cp .env.example .env
```

Configurar las variables necesarias en `.env`.

## ▶️ Desarrollo

Ejecutar el servidor en modo desarrollo:

```bash
npm run dev
```

Por defecto, la API estará disponible en:

```text
http://localhost:3000
```

## 🧪 Testing

Los tests se ejecutarán mediante:

```bash
npm test
```

El proyecto contempla diferentes niveles de testing:

```text
Unit
  ↓
Integration
  ↓
API
  ↓
E2E
```

## 🐳 Docker

**Pendiente** — todavía no hay `Dockerfile` ni `docker-compose.yml` en el repositorio.

Cuando se implemente, el flujo previsto será:

```bash
docker compose build
docker compose up
docker compose down
```

## 🔐 Variables de entorno

Las credenciales y configuraciones sensibles no deben almacenarse en el repositorio.

Copiar `cp .env.example .env` y completar. La app valida el env al boot
(envSchema en `src/config/env.ts`) y **no arranca** con configuración inválida:

```env
NODE_ENV=development
PORT=3000
JWT_SECRET=                  # mínimo 32 caracteres
DATABASE_URL=                # postgresql://user:pass@host:5432/db
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
RATE_LIMIT_ENABLED=true
RATE_LIMIT_MAX=10
```

El archivo `.env` debe permanecer fuera del control de versiones.

## 🗺️ Roadmap

* [X] Inicializar proyecto Fastify + TypeScript.
* [X] Definir dominio y casos de uso.
* [X] Diseñar modelo de datos.
* [X] Configurar PostgreSQL.
* [X] Implementar persistencia.
* [X] Implementar productos.
* [X] Implementar movimientos de inventario.
* [X] Implementar autenticación.
* [X] Implementar autorización — `authenticate` (JWT) + `authorize('ADMIN' | 'OPERATOR')` por ruta.
* [X] Agregar validaciones.
* [X] Agregar manejo de errores.
* [X] Implementar tests unit (capa application).
* [X] Tests de integración (PostgreSQL real — las reglas críticas del stock) y e2e de API.
* [X] Endurecer seguridad (env Zod, JWT único, login timing-safe, bcrypt 12, rate limit, CORS allowlist).
* [ ] Dockerizar aplicación.
* [ ] Configurar CI/CD.
* [ ] Deploy de producción.
* [ ] Documentar API.
* [X] Frontend (React).

## 📌 Estado

🚧 **En desarrollo**

Este proyecto forma parte de un proceso de aprendizaje y práctica **Full-Stack End-to-End**, con especial foco en diseño de software, arquitectura, lógica de negocio, testing y despliegue.
