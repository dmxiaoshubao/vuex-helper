const Vue = require('vue')
const App = require('./App.vue').default
const resolvedStore = require('./store').default

function createAppOptions() {
  return {
    store: resolvedStore,
    render: h => h(App)
  }
}

new Vue(createAppOptions()).$mount('#app')
