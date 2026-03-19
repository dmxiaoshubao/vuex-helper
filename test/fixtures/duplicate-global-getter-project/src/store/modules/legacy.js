export default {
  namespaced: false,
  state: {
    count: 2,
  },
  getters: {
    sharedTotal: (state) => state.count * 10,
  },
};