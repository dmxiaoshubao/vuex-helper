import Vue from 'vue'
import Vuex from 'vuex'
import dynamicUser from './modules/dynamicUser'

Vue.use(Vuex)

const statsModule = {
  namespaced: true,
  state: {
    loaded: true
  },
  actions: {
    refresh() {}
  },
  mutations: {
    SET_LOADED() {}
  }
}

const NESTED_NS = ['nested', 'stats']
const legacyModule = require('./modules/legacy').default

const store = new Vuex.Store({
  state: {
    rootCount: 0
  },
  mutations: {
    INC() {}
  }
})

store.registerModule('dynamicUser', dynamicUser)
store.registerModule(NESTED_NS, statsModule)
store.registerModule('legacy', legacyModule)

export default store
