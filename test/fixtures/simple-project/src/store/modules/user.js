const state = {
  name: "John Doe",
};

const mutations = {
  SET_NAME(state, name) {
    state.name = name;
  },
};

const actions = {
  /** 更新名称 */
  updateName({ commit }, name) {
    commit("SET_NAME", name);
  },
};

export default {
  namespaced: true,
  state,
  mutations,
  actions,
};
