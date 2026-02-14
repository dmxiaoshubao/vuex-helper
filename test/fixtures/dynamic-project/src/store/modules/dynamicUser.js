export default {
  namespaced: true,
  state: {
    name: ''
  },
  getters: {
    displayName: state => state.name
  },
  actions: {
    fetchProfile() {}
  },
  mutations: {
    SET_NAME() {}
  }
}
