# Project Context — Inventory Management System

> Documento de contexto para comprender el propósito, alcance, dominio y reglas del proyecto antes de realizar cambios en el código.

---

## 1. ¿Qué estamos construyendo?

Estamos construyendo un **sistema web de gestión de inventario** para una pequeña o mediana empresa que trabaja con productos físicos.

El sistema permite centralizar y controlar la información relacionada con:

* Productos.
* Stock.
* Entradas de mercadería.
* Salidas de mercadería.
* Usuarios.
* Roles y permisos.
* Historial de movimientos.
* Alertas de stock bajo.

El proyecto se desarrolla como una aplicación **Full-Stack End-to-End**, incluyendo frontend, backend, base de datos, testing, Docker, CI/CD y deployment.

---

# 2. ¿Qué problema resolvemos?

El problema principal es la falta de un mecanismo confiable para controlar el inventario.

Una empresa puede comenzar utilizando:

* planillas de Excel;
* anotaciones manuales;
* mensajes entre empleados;
* sistemas separados;
* controles físicos.

Estos mecanismos pueden provocar:

* diferencias entre el stock real y el registrado;
* errores humanos;
* productos vendidos que aparentemente estaban disponibles;
* compras innecesarias;
* falta de trazabilidad;
* dificultad para saber quién realizó una operación;
* dificultad para conocer el historial de un producto.

### Problema central

> La empresa necesita mantener un control confiable y actualizado de su inventario, registrar cada movimiento de mercadería y poder determinar cómo se llegó al stock actual.

---

# 3. ¿Quién utiliza el sistema?

## Administrador / Encargado

Es responsable de la gestión del inventario.

Puede:

* crear productos;
* modificar información de productos;
* desactivar productos;
* consultar stock;
* consultar movimientos;
* registrar entradas;
* registrar salidas;
* consultar productos con stock bajo;
* gestionar usuarios y permisos.

## Operario

Trabaja directamente con la mercadería.

Puede:

* consultar productos;
* consultar stock;
* registrar entradas;
* registrar salidas;
* consultar movimientos según sus permisos.

No debe poder realizar acciones administrativas que no le correspondan.

---

# 4. Objetivo del MVP

El MVP debe resolver una pregunta fundamental:

> **¿Qué productos tenemos, cuánto stock tenemos y qué movimientos explican ese stock?**

Por lo tanto, el MVP debe incluir:

* autenticación;
* usuarios;
* roles;
* productos;
* stock;
* entradas de stock;
* salidas de stock;
* historial de movimientos;
* alertas de stock bajo.

No debemos agregar funcionalidades únicamente porque sean técnicamente interesantes.

---

# 5. Fuera del alcance inicial

El MVP NO contempla inicialmente:

* facturación;
* pagos;
* contabilidad;
* gestión completa de clientes;
* gestión completa de proveedores;
* compras;
* ventas;
* microservicios;
* sistemas distribuidos;
* IA;
* funcionalidades innecesarias para el problema principal.

Estas funcionalidades podrían evaluarse posteriormente si tienen sentido para el dominio.

---

# 6. Conceptos principales del dominio

## Product

Representa un producto que la empresa posee o comercializa.

Conceptualmente contiene:

```text
Product
├── id
├── sku
├── name
├── description
├── price
├── stock
├── minimumStock
├── active
├── createdAt
└── updatedAt
```

## User

Representa una persona que utiliza el sistema.

Debe tener un rol que determine qué operaciones puede realizar.

## Movement

Representa una modificación del stock.

Conceptualmente:

```text
Movement
├── id
├── productId
├── userId
├── type
├── quantity
├── reason
└── createdAt
```

Los tipos iniciales son:

```text
IN
OUT
```

---

# 7. Regla fundamental del inventario

## El stock no se modifica directamente.

No debe existir una operación de negocio equivalente a:

```text
updateProduct({
    stock: 100
})
```

El stock cambia únicamente mediante operaciones explícitas de inventario:

```text
RegisterStockEntry
RegisterStockExit
```

Esto garantiza que cada modificación pueda quedar registrada.

---

# 8. Reglas de negocio

Estas reglas representan invariantes del sistema y no deben romperse sin una decisión explícita sobre el dominio.

### Regla 1 — Stock no negativo

El stock nunca puede ser menor que cero.

```text
stock >= 0
```

Una salida que supere el stock disponible debe rechazarse.

---

### Regla 2 — Cantidades positivas

Una entrada o salida debe tener una cantidad mayor que cero.

```text
quantity > 0
```

No deben utilizarse cantidades negativas para representar operaciones.

---

### Regla 3 — SKU único

Cada producto debe tener un SKU único.

La unicidad debe estar protegida tanto a nivel de aplicación como mediante una restricción apropiada en la base de datos.

---

### Regla 4 — Stock modificado mediante movimientos

Toda modificación del stock debe realizarse mediante una operación de inventario.

---

### Regla 5 — Todo cambio de stock genera un movimiento

Si una operación cambia el stock, debe existir un registro histórico que explique dicho cambio.

---

### Regla 6 — Movimientos inmutables

Los movimientos históricos no deben modificarse ni eliminarse.

Si se comete un error, debe generarse una nueva operación que corrija el estado.

Ejemplo:

```text
Movimiento incorrecto:
OUT 10

Corrección:
IN 10
```

De esta manera se mantiene la trazabilidad.

---

### Regla 7 — Productos inactivos

Un producto desactivado no puede recibir nuevos movimientos.

Sin embargo, su información histórica debe conservarse.

Por esta razón se prefiere la desactivación lógica antes que eliminar físicamente el registro.

---

### Regla 8 — Stock bajo

Cuando:

```text
stock < minimumStock
```

el producto debe considerarse en estado de stock bajo.

Esto representa una alerta y no necesariamente un bloqueo de operaciones.

---

### Regla 9 — Operaciones atómicas

Una entrada o salida de stock debe garantizar la consistencia entre:

```text
stock actual
+
historial de movimientos
```

Conceptualmente:

```text
BEGIN TRANSACTION

Validar operación
      ↓
Modificar stock
      ↓
Registrar movimiento

COMMIT
```

Si una parte falla:

```text
ROLLBACK
```

No debe quedar un stock actualizado sin movimiento correspondiente, ni un movimiento registrado sin actualización de stock.

---

### Regla 10 — Autorización

Autenticarse no significa tener permiso para realizar cualquier operación.

El sistema debe diferenciar:

```text
Authentication
    ↓
¿Quién sos?

Authorization
    ↓
¿Qué podés hacer?
```

---

# 9. Casos de uso principales

## Authentication

```text
RegisterUser
Login
```

## Products

```text
CreateProduct
GetProduct
ListProducts
UpdateProduct
DeactivateProduct
GetLowStockProducts
```

## Inventory

```text
RegisterStockEntry
RegisterStockExit
GetMovementHistory
```

---

# 10. Flujo conceptual de una entrada

Ejemplo:

> Llegan 30 unidades de un producto.

El sistema debe:

```text
Usuario
   ↓
Solicita entrada
   ↓
Validar datos
   ↓
Validar permisos
   ↓
Verificar producto
   ↓
Verificar que esté activo
   ↓
Actualizar stock
   ↓
Crear movimiento
   ↓
Confirmar transacción
```

Resultado:

```text
Stock anterior: 10
Entrada:        +30
Stock nuevo:    40
```

Y queda registrado quién realizó la operación.

---

# 11. Flujo conceptual de una salida

Ejemplo:

> Se retiran 8 unidades.

```text
Usuario
   ↓
Solicita salida
   ↓
Validar datos
   ↓
Validar permisos
   ↓
Verificar producto
   ↓
Verificar stock suficiente
   ↓
Disminuir stock
   ↓
Crear movimiento
   ↓
Confirmar transacción
```

Si:

```text
stock = 5
quantity = 8
```

la operación debe rechazarse.

---

# 12. Arquitectura

La arquitectura debe mantener separadas las responsabilidades.

Conceptualmente:

```text
HTTP
 ↓
Routes
 ↓
Controllers
 ↓
Use Cases
 ↓
Domain
 ↓
Repositories
 ↓
Database
```

Las decisiones específicas de infraestructura no deben contaminar innecesariamente la lógica de negocio.

### Principio importante

> La lógica de negocio no debería depender directamente de Fastify ni de PostgreSQL.

Fastify es una herramienta de infraestructura.

PostgreSQL es una herramienta de persistencia.

El dominio debe representar las reglas del negocio.

---

# 13. Principios de desarrollo

Durante el proyecto priorizar:

* claridad;
* separación de responsabilidades;
* SOLID cuando aporte valor;
* bajo acoplamiento;
* alta cohesión;
* código testeable;
* validación de entradas;
* manejo explícito de errores;
* consistencia de datos;
* seguridad;
* simplicidad.

No introducir patrones, abstracciones o tecnologías únicamente para hacer el proyecto más complejo.

> **La arquitectura debe responder a necesidades reales del sistema.**

---

# 14. Stack

## Backend

```text
Node.js
TypeScript
Fastify
PostgreSQL
Zod
JWT
```

El ORM/persistencia se decidirá durante el desarrollo.

## Frontend

```text
React
TypeScript
```

## Infraestructura

```text
Docker
Docker Compose
GitHub Actions
```

---

# 15. Criterio para tomar decisiones

Antes de implementar una funcionalidad, responder:

1. ¿Qué problema del negocio resuelve?
2. ¿Quién necesita esta funcionalidad?
3. ¿Cuál es el caso de uso?
4. ¿Qué regla de negocio existe?
5. ¿Qué datos necesita?
6. ¿Qué puede salir mal?
7. ¿Qué debe garantizar el sistema?
8. ¿Dónde debería vivir esta responsabilidad?
9. ¿Cómo vamos a probarla?
10. ¿Estamos agregando complejidad innecesaria?

---

# 16. Instrucciones para trabajar con IA

Este archivo representa el contexto funcional del proyecto.

Antes de modificar código:

1. Comprender el problema que el proyecto intenta resolver.
2. Respetar los actores y casos de uso definidos.
3. Respetar las reglas de negocio.
4. No modificar una regla de negocio para solucionar un problema técnico sin explicarlo primero.
5. No introducir dependencias o patrones innecesarios.
6. Mantener separadas las responsabilidades.
7. Priorizar soluciones simples y mantenibles.
8. Si una decisión arquitectónica puede afectar el dominio, explicarla antes de implementarla.
9. No asumir requisitos que no estén definidos.
10. Si aparece una contradicción entre el código y este documento, señalarla y pedir una decisión antes de cambiar una regla importante.

La IA debe actuar como **asistente de ingeniería**, no simplemente como generador de código.

---

# 18. Convenciones técnicas — Fastify + Zod + Drizzle

## Validación de datos — CÓMO funciona realmente

### REGLA: NO usar `schema` de Fastify con Zod

Fastify tiene un sistema de schemas propio basado en JSON Schema.
Zod genera sus propios tipos de TypeScript.
**Los dos sistemas NO se comunican entre sí.**

Si hacés esto:

```typescript
// ❌ MAL — Fastify no infiere los tipos de Zod
app.post('/products', {
  schema: { body: createProductSchema },
}, controller.create);
```

TypeScript va a tipar `request.body` como `unknown`, y el controller va a tirar errores de tipo.

### Patrón correcto: Validar CON Zod dentro del controller

```typescript
// ✅ BIEN — Validación manual con Zod en el controller
async create(request: FastifyRequest, reply: FastifyReply) {
  const parsed = createProductSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      message: 'Invalid data',
      errors: parsed.error.flatten(),
    });
  }
  // parsed.data tiene los tipos correctos
  const product = await this.createProductUseCase.execute(parsed.data);
  return reply.status(201).send(product);
}
```

**¿Por qué `safeParse` y no `parse`?**
- `parse` tira excepción si falla → necesitás try/catch
- `safeParse` devuelve `{ success: true, data }` o `{ success: false, error }` → más limpio en controllers

## Controllers — Convenciones

### Los types de request van VACÍOS

```typescript
// ❌ MAL — Tipar el body en el controller
async create(request: FastifyRequest<{ Body: CreateProductInput }>, reply: FastifyReply)

// ✅ BIEN — Dejar que Zod maneje los tipos
async create(request: FastifyRequest, reply: FastifyReply)
```

El controller NO sabe qué tipo es el body hasta que Zod lo valide.
La seguridad viene de Zod, no de los types de Fastify.

### Naming de propiedades vs métodos

NUNCA una propiedad y un método pueden llamarse igual en una clase:

```typescript
// ❌ MAL — Propiedad y método con el mismo nombre
class AuthController {
  constructor(private login: Login) {}  // propiedad "login"
  async login() {}                      // método "login" → DUPLICATE IDENTIFIER
}

// ✅ BIEN — Propiedad con sufijo "UseCase"
class AuthController {
  constructor(private loginUseCase: Login) {}
  async login() { this.loginUseCase.execute(...) }
}
```

## Rutas — Convenciones

### Las dependencias se inyectan en las routes, NO en index.ts

```typescript
// ✅ BIEN — Cada archivo de routes arma su propio árbol de dependencias
export async function productRoutes(app: FastifyInstance) {
  const repository = new DrizzleProductRepository();
  const createProduct = new CreateProduct(repository);
  const controller = new ProductController(createProduct, ...);

  app.post('/products', controller.create.bind(controller));
}
```

### Siempre `.bind(controller)` en los métodos del controller

Fastify pierde el contexto de `this` si no se bindea.

## Middleware — authenticate y authorize

```typescript
// authenticate — verifica que el token sea válido
app.addHook('preHandler', authenticate);
// O por ruta:
app.get('/products', { preHandler: [authenticate] }, handler);

// authorize — verifica que el usuario tenga el rol correcto
app.post('/users', {
  preHandler: [authenticate, authorize('ADMIN')],
}, handler);
```

**¿Por qué authenticate como hook global y no por ruta?**
Porque CASI todas las rutas necesitan auth. Es más limpio registrarlo una vez.

## Repositories — Convenciones

### Drizzle y los tipos

- `pgTable` genera tipos internos de Drizzle
- Para convertir de Drizzle type → Domain type, crear un método `toDomain()`
- Los repositorios son las ÚNICAS clases que importan de `drizzle-orm`

### Convenciones de queries

```typescript
// Usar .returning() siempre que se necesite el resultado
const [created] = await db.insert(products).values(data).returning();

// Para queries con filtros, construir array de condiciones
const conditions = [];
if (filters?.search) conditions.push(ilike(products.name, `%${filters.search}%`));
if (conditions.length > 0) {
  query = query.where(and(...conditions));
}
```

## Archivos de configuración

### tsconfig.json

```json
{
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "bundler",
    "types": ["node"],
    "rootDir": "./src",
    "outDir": "./dist",
    "strict": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "skipLibCheck": true
  }
}
```

**NO usar `"module": "nodenext"`** — requiere extensiones explícitas en imports.
**Usar `"moduleResolution": "bundler"`** — compatible con tsx/esbuild.

### dotenv

`dotenv.config()` debe estar en `src/infrastructure/database/index.ts`, NO solo en `src/index.ts`.
Si solo está en index.ts, los scripts (seed, migrations) no cargan las variables de entorno.

---

# 17. Filosofía del proyecto

El objetivo no es solamente terminar una aplicación funcional.

El objetivo es aprender a recorrer el proceso completo:

```text
Problema
   ↓
Requisitos
   ↓
Casos de uso
   ↓
Dominio
   ↓
Arquitectura
   ↓
Base de datos
   ↓
Backend
   ↓
Frontend
   ↓
Testing
   ↓
Docker
   ↓
CI/CD
   ↓
Deploy
   ↓
Producción
```

La pregunta principal durante todo el desarrollo no debe ser:

> "¿Cómo hago que esto funcione?"

sino:

> **"¿Qué problema estamos resolviendo y cuál es la forma más simple, correcta y mantenible de resolverlo?"**

---

# 19. Decisiones de seguridad — Fase 2

Decisiones tomadas tras una auditoría de seguridad del stack completo. Cada una
responde a un hallazgo concreto y documenta el porqué, para que no se reviertan
por accidente ni se repitan los errores.

## 19.1 Timing attack en login — dummy hash (A+G+H)

**Hallazgo**: `login.ts` devolvía `Invalid credentials` SIN ejecutar bcrypt
cuando el email no existía. La latencia de respuesta distinguía "email
registrado" de "email inexistente" → enumeración de cuentas por timing side
channel.

**Solución**: `bcrypt.compare` se ejecuta SIEMPRE. Con email inexistente se
compara contra un hash dummy **precomputado** con el MISMO costo de producción
(`$2b$12$`). Precomputado = cero costo al boot, y si el costo cambia en el
futuro, el dummy debe regenerarse con el mismo costo (protegido por test:
assert del prefijo `$2b$12$` en `login.test.ts`).

## 19.2 Errores tipados de dominio (G)

**Hallazgo**: el controller distinguía errores por `error.message === '...'` →
cambiar el texto de un error rompía el contrato HTTP en silencio.

**Solución**: `DomainError` + subclases (`InvalidCredentialsError`,
`AccountDeactivatedError`, `EmailAlreadyRegisteredError`) en
`src/domain/auth-errors.ts`. El controller mapea con `instanceof`. Mensajes
centralizados en las clases.

**Decisión de producto (explícitamente pedida)**:
- `Invalid credentials` — mismo mensaje para email inexistente y password mala
  (no filtrar qué emails existen).
- `User is deactivated` — mensaje DISTINTO a propósito: solo se emite cuando la
  password YA fue válida, así que solo lo ve alguien que conoce las
  credenciales. UX real > ocultación marginal.

## 19.3 bcrypt costo 12 (H)

`BCRYPT_ROUNDS = 12` vive en `src/domain/auth.ts` y lo comparten registro,
seed y el reset de la TEST DB. Costo único = si el dummy hash del timing attack
tuviera otro costo, la protección se caería por un side channel. Migración de
hashes viejos = password reset, no re-hash automático.

## 19.4 JWT unificado — jsonwebtoken only (E)

**Hallazgo**: DOS librerías JWT (`jsonwebtoken` firmaba, `@fastify/jwt`
verificaba) → dos codificaciones, dos superficies, secretos mal tipados
(`JWT_SECRET!`).

**Solución**: un solo `JwtService` (jsonwebtoken) decorado en la instancia
(types en `src/types/fastify.d.ts`). `JWT_SECRET` validado por Zod: mínimo 32
chars, requerido (sin `!` en el código). Se eliminó `@fastify/jwt`.

## 19.5 Rate limit en login (B)

**Hallazgo**: `/auth/login` (único endpoint público con bcrypt cost 12) sin
protección → fuerza bruta ilimitada.

**Solución**: `@fastify/rate-limit` con `global: false`, aplicado SOLO a
`POST /auth/login` (marcado por config de ruta): `RATE_LIMIT_MAX` (default 10)
requests por IP en ventana de 15 minutos → 429. Los endpoints autenticados NO
tienen rate limit por IP (los protege la auth). Configurable por env
(`RATE_LIMIT_ENABLED`, `RATE_LIMIT_MAX`); los tests e2e lo desactivan
(`test-e2e-env.ts`) porque ejecutan muchos logins en secuencia. El comportamiento
se cubre con un integration test dedicado (env con max chico).

## 19.6 CORS allowlist (C)

**Hallazgo**: `app.register(cors)` sin opciones → reflejaba CUALQUIER origin.

**Solución**: allowlist desde env `CORS_ORIGINS` (dev frontend 5173, e2e 4310).
Métodos y headers explícitos (`Content-Type`, `Authorization`). Test de
contrato: origin permitido → echo; foráneo → sin header CORS; preflight → 204
con allow-methods/headers. Con `Authorization` header (no cookies) el riesgo
real era bajo, pero un CORS abierto es una bomba de tiempo.

## 19.7 Sesión del frontend — localStorage (F)

**Hallazgo**: el token JWT se guarda en `localStorage` (tokenStore.ts).

**Análisis**: los dos riesgos clásicos de localStorage son XSS y robo vía
extensiones maliciosas. La auditoría de XSS del frontend dio **cero surfaces**
(grep de `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `document.write`: sin
matches) y React escapa HTML por defecto. El sistema NO usa cookies: bearer
token con `Authorization` header, así que no hay riesgo de CSRF. El trade-off
de cookies httpOnly (más seguro contra XSS) trae CSRF + doble token +
cross-site infraestructura — complejidad neta negativa para el tamaño del
sistema.

**Decisión**: se MANTIENE localStorage, con las mitigaciones ya presentes:
- 401 global → limpieza de sesión + redirect a `/login` (token expirado o
  inválido no deja al usuario "atrapado").
- El token se elimina en logout explícito.

**Cuándo revisitarlo**: si el frontend alguna vez necesita renderizar HTML sin
escape (rich text, markdown) o crece el equipo/la superficie, migrar a cookies
httpOnly + SameSite y reconsiderar. Hasta esa fecha, localStorage es la
decisión simple y correcta para este sistema.

{
  "email": "admin@inventory.com",
  "password": "admin123"
} ADMIN