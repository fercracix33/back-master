# Backend del Proyecto

Este proyecto es un backend desarrollado en Node.js con TypeScript. Proporciona una API RESTful para gestionar diversas funcionalidades como autenticación, gestión de usuarios, comunidades, recursos, eventos, notificaciones, entre otros. Utiliza Prisma como ORM para interactuar con la base de datos y Socket.IO para funcionalidades en tiempo real.

## Estructura del Proyecto

La estructura del proyecto está organizada de la siguiente manera:

```
back-master/
├── api-documentation.yaml
├── package.json
├── tsconfig.json
├── prisma/
│   └── schema.prisma
├── src/
│   ├── index.ts
│   ├── middleware/
│   │   └── auth.ts
│   ├── prisma/
│   │   └── client.ts
│   ├── routes/
│   │   ├── auth.ts
│   │   ├── boards.ts
│   │   ├── chat.ts
│   │   ├── communities.ts
│   │   ├── communityResources.ts
│   │   ├── communityThreads.ts
│   │   ├── events.ts
│   │   ├── files.ts
│   │   ├── folders.ts
│   │   ├── friends.ts
│   │   ├── notes.ts
│   │   ├── notifications.ts
│   │   ├── tags.ts
│   │   └── users.ts
│   ├── socket/
│   │   ├── eventBus.ts
│   │   ├── index.ts
│   │   └── scheduledNotifier.ts
│   └── types/
│       └── AuthRequest.ts
└── test/
    ├── test.js
    ├── test2.js
    ├── test3.js
    ├── test4.js
    └── test5.js
```

## Descripción de Archivos

### Archivos Principales

- **api-documentation.yaml**: Contiene la documentación de la API en formato OpenAPI 3.0.
- **package.json**: Archivo de configuración del proyecto que incluye dependencias y scripts.
- **tsconfig.json**: Configuración de TypeScript para el proyecto.

### Carpeta `prisma`

- **schema.prisma**: Define el esquema de la base de datos y las relaciones entre las entidades.

### Carpeta `src`

#### Archivo Principal

- **index.ts**: Punto de entrada de la aplicación. Configura el servidor Express, las rutas, middleware y la conexión con Socket.IO.

#### Carpeta `middleware`

- **auth.ts**: Contiene middleware para la autenticación de rutas HTTP y WebSocket.

#### Carpeta `prisma`

- **client.ts**: Configuración del cliente Prisma para interactuar con la base de datos.

#### Carpeta `routes`

- **auth.ts**: Maneja rutas relacionadas con la autenticación, como registro, inicio de sesión y obtención de datos del usuario autenticado.
- **boards.ts**: Gestiona tableros y tareas asociadas a ellos.
- **chat.ts**: Proporciona rutas para la creación y gestión de chats (privados y grupales).
- **communities.ts**: Maneja comunidades, incluyendo creación, unión, gestión de miembros y métricas.
- **communityResources.ts**: Gestiona recursos comunitarios como archivos, notas y carpetas.
- **communityThreads.ts**: Proporciona rutas para la creación y gestión de hilos en comunidades.
- **events.ts**: Maneja eventos de calendario, incluyendo creación, actualización y eliminación.
- **files.ts**: Gestiona la subida, obtención y eliminación de archivos.
- **folders.ts**: Proporciona rutas para la creación, edición y eliminación de carpetas.
- **friends.ts**: Maneja solicitudes de amistad y la lista de amigos del usuario.
- **notes.ts**: Gestiona notas del usuario, incluyendo creación, edición, eliminación y obtención de notas públicas.
- **notifications.ts**: Proporciona rutas para la gestión de notificaciones del usuario.
- **tags.ts**: Maneja etiquetas, incluyendo creación, edición y eliminación.
- **users.ts**: Proporciona rutas para obtener información de otros usuarios.

#### Carpeta `socket`

- **eventBus.ts**: Implementa un sistema de eventos para manejar notificaciones y actualizaciones en tiempo real.
- **index.ts**: Configura la conexión de Socket.IO y define eventos relacionados con chats, notificaciones y más.
- **scheduledNotifier.ts**: Maneja notificaciones programadas para eventos.

#### Carpeta `types`

- **AuthRequest.ts**: Define el tipo extendido de `Request` para incluir información del usuario autenticado.

### Carpeta `test`

- **test.js**, **test2.js**, **test3.js**, **test4.js**, **test5.js**: Archivos de prueba para validar funcionalidades del backend.

## Instalación y Configuración

1. Clona el repositorio:
   ```bash
   git clone <URL_DEL_REPOSITORIO>
   ```
2. Instala las dependencias:
   ```bash
   npm install
   ```
3. Configura las variables de entorno en un archivo `.env`.
4. Ejecuta las migraciones de la base de datos:
   ```bash
   npx prisma migrate dev
   ```
5. Inicia el servidor:
   ```bash
   npm start
   ```

## Scripts Disponibles

- `npm start`: Inicia el servidor en modo producción.
- `npm run dev`: Inicia el servidor en modo desarrollo con recarga automática.
- `npm test`: Ejecuta las pruebas.

## Tecnologías Utilizadas

- **Node.js**: Entorno de ejecución para JavaScript.
- **TypeScript**: Superconjunto tipado de JavaScript.
- **Express**: Framework para construir aplicaciones web.
- **Prisma**: ORM para interactuar con la base de datos.
- **Socket.IO**: Comunicación en tiempo real.
- **Jest**: Framework de pruebas.

