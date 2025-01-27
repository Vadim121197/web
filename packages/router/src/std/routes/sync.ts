import { ServicesInterface, SwMessageHandler, SyncBlocksMessage } from '@penumbra-zone/types';

export const syncBlocksHandler =
  (services: ServicesInterface): SwMessageHandler<SyncBlocksMessage> =>
  async () => {
    const ws = await services.getWalletServices();
    await ws.blockProcessor.syncBlocks();
  };
