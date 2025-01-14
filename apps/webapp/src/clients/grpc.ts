import { createPromiseClient } from '@connectrpc/connect';
import { ViewProtocolService } from '@buf/penumbra-zone_penumbra.connectrpc_es/penumbra/view/v1alpha1/view_connect';
import { createEventTransport } from '@penumbra-zone/transport';
import { SimulationService } from '@buf/penumbra-zone_penumbra.connectrpc_es/penumbra/core/component/dex/v1alpha1/dex_connect';
import { CustodyProtocolService } from '@buf/penumbra-zone_penumbra.connectrpc_es/penumbra/custody/v1alpha1/custody_connect';
import { Query as IbcClientService } from '@buf/cosmos_ibc.connectrpc_es/ibc/core/client/v1/query_connect';

export const viewClient = createPromiseClient(
  ViewProtocolService,
  createEventTransport(ViewProtocolService),
);

export const custodyClient = createPromiseClient(
  CustodyProtocolService,
  createEventTransport(CustodyProtocolService),
);

export const simulateClient = createPromiseClient(
  SimulationService,
  createEventTransport(SimulationService),
);

export const ibcClient = createPromiseClient(
  IbcClientService,
  createEventTransport(IbcClientService),
);
