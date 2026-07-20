import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  namespace: '/admin',
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private connectedAdmins = new Map<string, Socket>();

  handleConnection(client: Socket) {
    const token = client.handshake.auth?.token;
    if (!token) {
      client.disconnect();
      return;
    }
    this.connectedAdmins.set(client.id, client);
  }

  handleDisconnect(client: Socket) {
    this.connectedAdmins.delete(client.id);
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(client: Socket, payload: { events: string[] }) {
    payload.events.forEach((event) => {
      client.join(`event:${event}`);
    });
  }

  emit(event: string, data: Record<string, unknown>) {
    this.server.emit(event, {
      event,
      data,
      timestamp: new Date().toISOString(),
    });
  }
}
