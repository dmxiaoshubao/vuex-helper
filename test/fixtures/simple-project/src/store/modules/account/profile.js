const state = {
  nickname: "guest",
};

const getters = {
  profileName: (state) => state.nickname,
};

const mutations = {
  SET_NICKNAME(state, nickname) {
    state.nickname = nickname;
  },
};

const actions = {
  renameProfile(context) {
    // [CTX.profile.1] 继承父命名空间 getter
    context.getters.readyLabel; // <- 光标放 readyLabel 上

    // [CTX.profile.2] 子模块本地 getter 仍在继承后的命名空间中
    context.getters.profileName; // <- 光标放 profileName 上

    context.commit("SET_READY", true);
    context.commit("SET_NICKNAME", "neo");
    context.dispatch("loadAccount");
    return context.state.nickname;
  },
  inspectMissingGetter(context) {
    return context.getters.missingInheritedGetter; // <- 应触发诊断
  },
};

export default {
  state,
  getters,
  mutations,
  actions,
};
