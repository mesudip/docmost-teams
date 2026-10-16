export class CollaborationGateway {
  server = {
    to: jest.fn().mockReturnThis(),
    emit: jest.fn(),
  };

  emitToRoom = jest.fn();
}
