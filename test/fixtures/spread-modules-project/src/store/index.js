import Vue from 'vue'
import Vuex from 'vuex'
import userModule from './modules/user'

Vue.use(Vuex)

const sharedModules = {
  shared: require('./modules/shared').default
}

const localModules = {
  ...sharedModules,
  user: userModule
}

export default new Vuex.Store({
  modules: {
    ...localModules,
    inline: {
      namespaced: true,
      state: {
        value: 1
      },
      mutations: {
        SET_VALUE() {}
      }
    }
  }
})
