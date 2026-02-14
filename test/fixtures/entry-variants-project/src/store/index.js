const Vue = require('vue')
const Vuex = require('vuex')

Vue.use(Vuex)

function buildStore() {
  return new Vuex.Store({
    state: {
      ready: true
    },
    mutations: {
      SET_READY() {}
    },
    actions: {
      boot() {}
    }
  })
}

module.exports = buildStore()
module.exports.default = module.exports
