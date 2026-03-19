export default {
  namespaced: true,
  state: {
    count: 3,
  },
  getters: {
    sharedTotal: (state) => state.count * 100,
  },
};
