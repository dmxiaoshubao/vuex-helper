<template>
  <section>
    <h1>Spread Modules Fixture Usage</h1>
    <p>{{ name }} / {{ inlineValue }}</p>
    <p>{{ ping }}</p>
  </section>
</template>

<script>
import { createNamespacedHelpers, mapActions, mapMutations, mapState } from 'vuex'

const SHARED_NS = 'shared'
const sharedHelpers = createNamespacedHelpers(SHARED_NS)

export default {
  name: 'SpreadModulesFixtureApp',
  computed: {
    ...mapState('user', ['name']),
    ...mapState('inline', {
      inlineValue: state => state.value
    }),
    ...sharedHelpers.mapGetters(['ping'])
  },
  methods: {
    ...mapMutations('user', ['SET_NAME']),
    ...mapMutations('inline', ['SET_VALUE']),
    ...sharedHelpers.mapActions(['heartbeat']),
    runSpreadScenario() {
      this.SET_NAME('spread-user')
      this.SET_VALUE(2)
      this.heartbeat()
      this.$store.commit('inline/SET_VALUE', 3)
      this.$store.dispatch('shared/heartbeat')

      const userName = this.$store.state.user.name
      const inlineValue = this.$store.state.inline.value
      const pingValue = this.$store.getters['shared/ping']
      return { userName, inlineValue, pingValue }
    }
  }
}
</script>
