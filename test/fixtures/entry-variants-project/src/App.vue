<template>
  <section>
    <h1>Entry Variants Fixture Usage</h1>
    <p>{{ ready }}</p>
  </section>
</template>

<script>
import { mapActions, mapMutations, mapState } from 'vuex'

export default {
  name: 'EntryVariantsFixtureApp',
  computed: {
    ...mapState(['ready'])
  },
  methods: {
    ...mapMutations(['SET_READY']),
    ...mapActions(['boot']),
    runEntryVariantScenario() {
      this.SET_READY()
      this.boot()
      this.$store.commit('SET_READY')
      this.$store.dispatch('boot')

      return {
        ready: this.$store.state.ready
      }
    }
  }
}
</script>
