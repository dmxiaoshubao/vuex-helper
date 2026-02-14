<template>
  <section>
    <h1>Edge Fixture Usage</h1>
    <p>{{ rootCount }} / {{ rootDouble }}</p>
    <p>{{ displayName }} / {{ profileName }}</p>
    <p>{{ enabled }}</p>
  </section>
</template>

<script>
import { createNamespacedHelpers, mapActions, mapGetters, mapMutations, mapState } from 'vuex'

const { mapState: mapUserState, mapGetters: mapUserGetters, mapActions: mapUserActions } =
  createNamespacedHelpers('userModule')

export default {
  name: 'EdgeFixtureApp',
  computed: {
    ...mapState(['rootCount']),
    ...mapGetters(['rootDouble']),
    ...mapState('publicModule', ['enabled']),
    ...mapUserState({
      profileName: state => state.profile.name
    }),
    ...mapUserGetters(['displayName'])
  },
  methods: {
    ...mapMutations(['SET_ROOT', 'TOGGLE']),
    ...mapActions(['loadRoot', 'trigger']),
    ...mapUserActions(['fetchProfile']),
    runEdgeScenario() {
      this.SET_ROOT()
      this.loadRoot()
      this.fetchProfile('fixture-user')
      this.$store.commit('userModule/SET_NAME', 'direct-user')
      this.$store.dispatch('userModule/fetchProfile', 'dispatch-user')
      this.$store.commit('TOGGLE')
      this.$store.dispatch('trigger')

      const root = this.$store.state.rootCount
      const userProfile = this.$store.state.userModule.profile.name
      const publicEnabled = this.$store.state.publicModule.enabled
      const userGetter = this.$store.getters['userModule/displayName']
      return { root, userProfile, publicEnabled, userGetter }
    }
  }
}
</script>
