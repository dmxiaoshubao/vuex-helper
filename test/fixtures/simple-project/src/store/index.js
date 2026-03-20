import Vue from "vue";
import Vuex from "vuex";
import user from "./modules/user";
import others from "./modules/others";
import account from "./modules/account";

Vue.use(Vuex);

export default new Vuex.Store({
  state: {
    /** count */
    count: 0,
    // logged in status
    isLoggedIn: false,
    /**
     * User preferences
     * @type {object}
     */
    preferences: {
      theme: "dark",
      notifications: true,
    },
    items: [],
  },
  getters: {
    isLoggedIn: (state, getters, rootState, rootGetters) => {
      rootState.others.language
      rootGetters['others/hasNotifications']
      return state.isLoggedIn
    },
    /**
     * Get item by id
     * @param {object} state
     * @returns {function}
     */
    getItemById: (state) => (id) => {
      return state.items.find((item) => item.id === id);
    },
  },
  mutations: {
    /** 增加 */
    increment(state) {
      state.count++;
    },
    // Set login status
    SET_LOGIN_STATUS(state, status) {
      state.isLoggedIn = status;
      state.othersss = 1;
    },
    /**
     * Update preferences
     * @param {object} state
     * @param {object} payload
     */
    UPDATE_PREFERENCES(state, payload) {
      state.preferences = { ...state.preferences, ...payload };
    },
    addItem(state, item) {
      state.items.push(item);
    },
  },
  actions: {
    incrementAsync({ commit }) {
      setTimeout(() => {
        commit("increment");
      }, 1000);
    },
    /**
     * Login action
     */
    async login({ commit }, credentials) {
      // simulate api call
      await new Promise((resolve) => setTimeout(resolve, 500));
      commit("SET_LOGIN_STATUS", true);
    },
    // Update preferences async
    updatePreferences({ commit, getters, state, dispatch }, preferences) {
      getters.getItemById
      state.others.language
      dispatch('login', null, { root: true })
      commit("UPDATE_PREFERENCES", preferences);
    },
  },
  modules: {
    user,
    others,
    account,
  },
});
