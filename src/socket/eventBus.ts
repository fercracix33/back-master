import { EventEmitter } from 'events';

/**
 * EventBus centralizado para eventos del sistema.
 * Este EventEmitter nos permite desacoplar la lógica de sockets de las rutas individuales.
 * Las rutas emiten eventos en el eventBus, y la configuración de sockets los escucha para enviar notificaciones en tiempo real.
 */
const eventBus = new EventEmitter();

export default eventBus;
