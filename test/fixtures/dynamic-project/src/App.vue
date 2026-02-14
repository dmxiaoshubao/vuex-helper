<template>
  <section>
    <h1>Dynamic Fixture Usage</h1>
    <p>{{ rootCount }} / {{ displayName }}</p>
    <p>{{ loaded }}</p>
  </section>
</template>

<script>
import { createNamespacedHelpers, mapActions, mapMutations, mapState } from 'vuex'

const userHelpers = createNamespacedHelpers('dynamicUser')

export default {
  name: 'DynamicFixtureApp',
  computed: {
    ...mapState(['rootCount']),
    ...mapState('nested/stats', ['loaded']),
    ...userHelpers.mapState(['name']),
    ...userHelpers.mapGetters(['displayName'])
  },
  methods: {
    ...mapMutations(['INC', 'TOGGLE_LEGACY']),
    ...mapMutations('nested/stats', ['SET_LOADED']),
    ...mapActions('nested/stats', ['refresh']),
    ...userHelpers.mapMutations(['SET_NAME']),
    ...userHelpers.mapActions(['fetchProfile']),
    runDynamicScenario() {
      this.INC()
      this.SET_NAME('fixture-user')
      this.fetchProfile('worker-user')
      this.SET_LOADED()
      this.refresh()
      this.$store.commit('TOGGLE_LEGACY')
      this.$store.commit('nested/stats/SET_LOADED')
      this.$store.dispatch('dynamicUser/fetchProfile', 'dispatch-user')

      const loaded = this.$store.state.nested.stats.loaded
      const legacyEnabled = this.$store.state.legacy.enabled
      const dynamicUserName = this.$store.state.dynamicUser.name
      return { loaded, legacyEnabled, dynamicUserName }
    }
  }
}
</script>
