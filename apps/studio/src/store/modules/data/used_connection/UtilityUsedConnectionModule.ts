import { IConnection } from "@/common/interfaces/IConnection";
import { DataState, DataStore, mutationsFor, utilActionsFor } from "@/store/modules/data/DataModuleBase";
import _ from "lodash";
import rawLog from "electron-log";

const log = rawLog.scope('data/usedconnections');

type State = DataState<IConnection>;

// NOTE (@day): may need to add a custom action for removeUsedConfig that also deletes the tokencache?
export const UtilUsedConnectionModule: DataStore<IConnection, State> = {
  namespaced: true,
  state: {
    items: [],
    loading: false,
    error: null,
    pollError: null
  },
  mutations: mutationsFor<IConnection>(),
  actions: utilActionsFor<IConnection>('used', {
    async recordUsed(context, config: IConnection) {
      log.debug("Recording used config for: ", config)
      const lastUsedConnection = context.state.items.find(c => {
        return config.id &&
          config.workspaceId &&
          ((!c.connectionId && c.id === config.id) || 
            (c.connectionId && c.connectionId === config.id)) &&
          c.workspaceId === config.workspaceId;
      });
      log.debug("Found used config", lastUsedConnection);
      if (lastUsedConnection) {
        lastUsedConnection.updatedAt = new Date();
        await context.dispatch('save', lastUsedConnection);
      } else {
        await context.dispatch('save', config);
      }
    }
  }),
  getters: {
    orderedUsedConfigs(state) {
      return _.sortBy(state.items, 'updatedAt').reverse()
    }
  }
}
