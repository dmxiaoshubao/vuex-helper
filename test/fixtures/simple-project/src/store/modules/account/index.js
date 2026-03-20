import profile from "./profile";

const state = {
  ready: true,
  publishCount: 0,
};

const getters = {
  readyLabel: (state) => (state.ready ? "ready" : "idle"),
  publishSummary: (state, getters, rootState) =>
    `${getters.readyLabel}:${rootState.count}`,
};

const mutations = {
  SET_READY(state, ready) {
    state.ready = ready;
  },
  SET_PUBLISH_COUNT(state, count) {
    state.publishCount = count;
  },
};

const actions = {
  loadAccount(context) {
    // [CTX.account.1] context.state 补全/跳转/悬浮
    context.state.ready; // <- 光标放 ready 上

    // [CTX.account.2] context.getters 补全/跳转/悬浮
    context.getters.readyLabel; // <- 光标放 readyLabel 上

    // [CTX.account.3] object-style root action 调用
    context.dispatch("publishProfile", null, { root: true }); // <- 光标放 publishProfile 上

    context.commit("SET_READY", true);
    context.dispatch("loadAccount");
  },
  publishProfile: {
    handler(context) {
      context.commit('SET_NICKNAME')
      // [CTX.handler.1] 对象式 action handler 中的 context.commit
      context.commit("SET_READY", true); // <- 光标放 SET_READY 上
      context.commit("increment", null, { root: true });
      context.rootGetters.isLoggedIn;

      // [CTX.handler.2] 对象式 action handler 中的 context.state
      return context.state.ready; // <- 光标放 ready 上
    },
    root: true,
  },
  refreshProfile: {
    handler(context) {
      context.commit('SET_NICKNAME')
      // [CTX.handler.3] 对象式 action handler 中的 context.getters
      return context.getters.readyLabel; // <- 光标放 readyLabel 上
    },
    root: false,
  },
  refreshProfile_test: {
    handler({ commit }) {
      // [CTX.handler.4] 对象式 action handler 中的解构 commit
      commit("SET_READY", true); // <- 光标放 SET_READY 上
      return true;
    },
  },
  inspectMissingState(context) {
    return context.state.missingAccountState; // <- 应触发诊断
  },
};

export default {
  namespaced: true,
  state,
  getters,
  mutations,
  actions,
  modules: {
    profile,
  },
};
