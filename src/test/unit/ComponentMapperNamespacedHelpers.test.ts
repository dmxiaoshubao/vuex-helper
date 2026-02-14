import * as assert from 'assert';
import * as Module from 'module';

const originalRequire = Module.prototype.require;
(Module.prototype as any).require = function(id: string) {
    if (id === 'vscode') {
        return {};
    }
    return originalRequire.apply(this, arguments as any);
};

import { ComponentMapper } from '../../services/ComponentMapper';

function createDocument(text: string) {
    return {
        uri: { toString: () => 'file:///namespaced-helper.vue' },
        version: 1,
        languageId: 'vue',
        getText: () => text
    } as any;
}

describe('ComponentMapper createNamespacedHelpers', () => {
    it('should map destructured helper aliases to namespace', () => {
        const mapper = new ComponentMapper();
        const doc = createDocument(`<script>
import { createNamespacedHelpers } from 'vuex'
const { mapState: mapUserState, mapActions } = createNamespacedHelpers('user')
export default {
  computed: {
    ...mapUserState(['profile'])
  },
  methods: {
    ...mapActions(['fetchProfile'])
  }
}
</script>`);

        const mapping = mapper.getMapping(doc);
        assert.ok(mapping.profile, 'profile mapping should exist');
        assert.strictEqual(mapping.profile.namespace, 'user');
        assert.strictEqual(mapping.profile.type, 'state');
        assert.ok(mapping.fetchProfile, 'fetchProfile mapping should exist');
        assert.strictEqual(mapping.fetchProfile.namespace, 'user');
        assert.strictEqual(mapping.fetchProfile.type, 'action');
    });

    it('should map helper object member calls to namespace', () => {
        const mapper = new ComponentMapper();
        const doc = createDocument(`<script>
import { createNamespacedHelpers } from 'vuex'
const userHelpers = createNamespacedHelpers('user')
export default {
  computed: {
    ...userHelpers.mapGetters(['displayName'])
  },
  methods: {
    ...userHelpers.mapMutations(['SET_NAME'])
  }
}
</script>`);

        const mapping = mapper.getMapping(doc);
        assert.ok(mapping.displayName, 'displayName mapping should exist');
        assert.strictEqual(mapping.displayName.namespace, 'user');
        assert.strictEqual(mapping.displayName.type, 'getter');
        assert.ok(mapping.SET_NAME, 'SET_NAME mapping should exist');
        assert.strictEqual(mapping.SET_NAME.namespace, 'user');
        assert.strictEqual(mapping.SET_NAME.type, 'mutation');
    });

    it('should map vuex import aliases', () => {
        const mapper = new ComponentMapper();
        const doc = createDocument(`<script>
import { mapState as ms, mapGetters as mg } from 'vuex'
export default {
  computed: {
    ...ms(['count']),
    ...mg({ loginStatus: 'isLoggedIn' })
  }
}
</script>`);

        const mapping = mapper.getMapping(doc);
        assert.ok(mapping.count, 'count mapping should exist');
        assert.strictEqual(mapping.count.type, 'state');
        assert.strictEqual(mapping.count.originalName, 'count');
        assert.ok(mapping.loginStatus, 'loginStatus mapping should exist');
        assert.strictEqual(mapping.loginStatus.type, 'getter');
        assert.strictEqual(mapping.loginStatus.originalName, 'isLoggedIn');
    });

    it('should map object function syntax in mapState', () => {
        const mapper = new ComponentMapper();
        const doc = createDocument(`<script>
import { mapState } from 'vuex'
export default {
  computed: {
    ...mapState('user', {
      profile: state => state.profile,
      count(state) { return state.count }
    })
  }
}
</script>`);

        const mapping = mapper.getMapping(doc);
        assert.ok(mapping.profile, 'profile mapping should exist');
        assert.strictEqual(mapping.profile.type, 'state');
        assert.strictEqual(mapping.profile.namespace, 'user');
        assert.strictEqual(mapping.profile.originalName, 'profile');
        assert.ok(mapping.count, 'count mapping should exist');
        assert.strictEqual(mapping.count.type, 'state');
        assert.strictEqual(mapping.count.namespace, 'user');
        assert.strictEqual(mapping.count.originalName, 'count');
    });

    it('should infer original state key from mapState function alias', () => {
        const mapper = new ComponentMapper();
        const doc = createDocument(`<script>
import { mapState } from 'vuex'
export default {
  computed: {
    ...mapState('user', {
      profileName: state => state.profile.name
    })
  }
}
</script>`);

        const mapping = mapper.getMapping(doc);
        assert.ok(mapping.profileName, 'profileName mapping should exist');
        assert.strictEqual(mapping.profileName.type, 'state');
        assert.strictEqual(mapping.profileName.namespace, 'user');
        assert.strictEqual(mapping.profileName.originalName, 'profile.name');
    });

    it('should infer original state key from namespaced helper function alias', () => {
        const mapper = new ComponentMapper();
        const doc = createDocument(`<script>
import { createNamespacedHelpers } from 'vuex'
const { mapState: mapUserState } = createNamespacedHelpers('user')
export default {
  computed: {
    ...mapUserState({
      profileName: state => state.profile.name
    })
  }
}
</script>`);

        const mapping = mapper.getMapping(doc);
        assert.ok(mapping.profileName, 'profileName mapping should exist');
        assert.strictEqual(mapping.profileName.type, 'state');
        assert.strictEqual(mapping.profileName.namespace, 'user');
        assert.strictEqual(mapping.profileName.originalName, 'profile.name');
    });

    it('should resolve namespace constants for helper factories and map helpers', () => {
        const mapper = new ComponentMapper();
        const doc = createDocument(`<script>
import { createNamespacedHelpers, mapState } from 'vuex'
const USER_NS = 'user'
const { mapGetters: mapUserGetters } = createNamespacedHelpers(USER_NS)
export default {
  computed: {
    ...mapUserGetters(['displayName']),
    ...mapState(USER_NS, { profile: state => state.profile })
  }
}
</script>`);

        const mapping = mapper.getMapping(doc);
        assert.ok(mapping.displayName, 'displayName mapping should exist');
        assert.strictEqual(mapping.displayName.type, 'getter');
        assert.strictEqual(mapping.displayName.namespace, 'user');
        assert.ok(mapping.profile, 'profile mapping should exist');
        assert.strictEqual(mapping.profile.type, 'state');
        assert.strictEqual(mapping.profile.namespace, 'user');
    });

    it('should map require destructuring aliases from vuex', () => {
        const mapper = new ComponentMapper();
        const doc = createDocument(`<script>
const { mapState: ms, mapActions } = require('vuex')
export default {
  computed: {
    ...ms(['count'])
  },
  methods: {
    ...mapActions(['incrementAsync'])
  }
}
</script>`);

        const mapping = mapper.getMapping(doc);
        assert.ok(mapping.count, 'count mapping should exist');
        assert.strictEqual(mapping.count.type, 'state');
        assert.strictEqual(mapping.count.originalName, 'count');
        assert.ok(mapping.incrementAsync, 'incrementAsync mapping should exist');
        assert.strictEqual(mapping.incrementAsync.type, 'action');
        assert.strictEqual(mapping.incrementAsync.originalName, 'incrementAsync');
    });
});
