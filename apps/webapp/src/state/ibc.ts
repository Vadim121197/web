import { assets } from '@penumbra-zone/constants';
import { Asset, AssetId, Chain, LoHi, toBaseUnit, uint8ArrayToHex } from '@penumbra-zone/types';
import { AllSlices, SliceCreator } from '.';
import { toast } from '@penumbra-zone/ui/components/ui/use-toast';
import { TransactionPlannerRequest } from '@buf/penumbra-zone_penumbra.bufbuild_es/penumbra/view/v1alpha1/view_pb';
import {
  errorTxToast,
  loadingTxToast,
  successTxToast,
} from '../components/shared/toast-content.tsx';
import BigNumber from 'bignumber.js';
import { typeRegistry } from '@penumbra-zone/types/src/registry.ts';
import { ClientState } from '@buf/cosmos_ibc.bufbuild_es/ibc/lightclients/tendermint/v1/tendermint_pb';
import { Height } from '@buf/cosmos_ibc.bufbuild_es/ibc/core/client/v1/client_pb';

export interface IbcSendSlice {
  asset: Asset;
  setAsset: (asset: AssetId) => void;
  amount: string;
  setAmount: (amount: string) => void;
  chain: Chain | undefined;
  destinationChainAddress: string | undefined;
  setDestinationChainAddress: (addr: string) => void;
  setChain: (chain: Chain | undefined) => void;
  sendIbcWithdraw: (toastFn: typeof toast) => Promise<void>;
  txInProgress: boolean;
}

export const createIbcSendSlice = (): SliceCreator<IbcSendSlice> => (set, get) => {
  return {
    amount: '',
    asset: assets[0]!,
    chain: undefined,
    destinationChainAddress: undefined,
    txInProgress: false,
    setAmount: amount => {
      set(state => {
        state.ibc.amount = amount;
      });
    },
    setAsset: asset => {
      const selectedAsset = assets.find(i => i.penumbraAssetId.inner === asset.inner)!;
      set(state => {
        state.ibc.asset = selectedAsset;
      });
    },
    setChain: chain => {
      set(state => {
        state.ibc.chain = chain;
      });
    },
    setDestinationChainAddress: addr => {
      set(state => {
        state.ibc.destinationChainAddress = addr;
      });
    },
    sendIbcWithdraw: async toastFn => {
      set(state => {
        state.send.txInProgress = true;
      });

      const { dismiss } = toastFn(loadingTxToast);

      try {
        const plannerReq = await getPlanRequest(get().ibc);
        const txHash = await planWitnessBuildBroadcast(plannerReq);
        dismiss();
        toastFn(successTxToast(txHash));

        // Reset form
        set(state => {
          state.send.amount = '';
          state.send.txInProgress = false;
        });
      } catch (e) {
        set(state => {
          state.send.txInProgress = false;
        });
        dismiss();
        toastFn(errorTxToast(e));
      }
    },
  };
};

const getWithdrawAmount = (asset: Asset, amount: string): LoHi => {
  const matchingExponent = asset.denomUnits.find(u => u.denom === asset.display)?.exponent ?? 0;
  return toBaseUnit(BigNumber(amount), matchingExponent);
};

const getTimeout = async (
  chain: Chain,
): Promise<{ timeoutTime: bigint; timeoutHeight: Height }> => {
  const twoDaysInMilliseconds = 2 * 24 * 60 * 60 * 1000; // 2 days * 24 hours/day * 60 minutes/hour * 60 seconds/minute * 1000 milliseconds/second
  const timeoutTime = BigInt(Date.now() + twoDaysInMilliseconds);

  const { ibcClient } = await import('../clients/grpc');

  const { clientStates } = await ibcClient.clientStates({});
  const unpacked = clientStates
    .map(cs => cs.clientState!.unpack(typeRegistry))
    .filter(Boolean) as ClientState[];

  const clientState = unpacked.find(cs => cs.chainId === chain.chainId);
  if (!clientState) throw new Error('Could not find chain id client state');

  // assuming a block time of 10s and adding ~1000 blocks (~3 hours)
  const revisionHeight = clientState.latestHeight!.revisionHeight + 1000n;

  return {
    timeoutTime,
    timeoutHeight: new Height({
      revisionHeight,
      revisionNumber: clientState.latestHeight!.revisionNumber,
    }),
  };
};

const getPlanRequest = async ({
  amount,
  asset,
  chain,
  destinationChainAddress,
}: IbcSendSlice): Promise<TransactionPlannerRequest> => {
  if (!destinationChainAddress) throw new Error('no destination chain address set');
  if (!chain?.ibcChannel) throw new Error('Chain ibc channel not available');

  const { viewClient } = await import('../clients/grpc');

  // TODO: implement source address in future, should correspond with asset selector?
  const { address: returnAddress } = await viewClient.ephemeralAddress({});
  if (!returnAddress) throw new Error('Error with generating ephemeral return address');

  const { timeoutHeight, timeoutTime } = await getTimeout(chain);

  return new TransactionPlannerRequest({
    ics20Withdrawals: [
      {
        amount: getWithdrawAmount(asset, amount),
        denom: { denom: asset.base },
        destinationChainAddress,
        returnAddress,
        timeoutHeight,
        timeoutTime,
        sourceChannel: chain.ibcChannel,
      },
    ],
  });
};

const planWitnessBuildBroadcast = async (plannerReq: TransactionPlannerRequest) => {
  const { viewClient, custodyClient } = await import('../clients/grpc');

  const { plan } = await viewClient.transactionPlanner(plannerReq);
  if (!plan) throw new Error('no plan in response');

  const { data: authorizationData } = await custodyClient.authorize({ plan });
  if (!authorizationData) throw new Error('no authorization data in response');

  const { transaction } = await viewClient.witnessAndBuild({
    transactionPlan: plan,
    authorizationData,
  });
  if (!transaction) throw new Error('no transaction in response');

  const { id } = await viewClient.broadcastTransaction({ transaction, awaitDetection: true });
  if (!id) throw new Error('no id in broadcast response');

  return uint8ArrayToHex(id.hash);
};

export const ibcSelector = (state: AllSlices) => state.ibc;
