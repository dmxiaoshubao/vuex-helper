import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { IssueRegistry } from '../../services/IssueRegistry';
import { QualityGate } from '../../services/QualityGate';
import { IssueScanner } from '../../services/IssueScanner';

describe('Issue Workflow', () => {
    it('should support lifecycle transition and audit logging', () => {
        const registry = new IssueRegistry();
        registry.createIssue({
            id: 'ISSUE-001',
            title: 'cache growth',
            type: 'memory',
            severity: 'high',
            impactScope: 'ComponentMapper',
            reproduction: 'Open many files',
            owner: 'dev'
        });

        registry.transition('ISSUE-001', 'analyzing', 'dev');
        registry.transition('ISSUE-001', 'in_progress', 'dev');
        registry.transition('ISSUE-001', 'fixed_pending_verification', 'dev', 'added LRU');

        const issue = registry.listIssues()[0];
        assert.strictEqual(issue.audit.length, 3);
        assert.strictEqual(issue.status, 'fixed_pending_verification');
    });

    it('should validate test mapping gate before verification', () => {
        const registry = new IssueRegistry();
        registry.createIssue({
            id: 'ISSUE-002',
            title: 'path traversal',
            type: 'security',
            severity: 'critical',
            impactScope: 'PathResolver',
            reproduction: 'Use ../../',
            owner: 'dev'
        });

        registry.linkTest('ISSUE-002', {
            testId: 'PathResolverSecurity.test.ts',
            preFixCovered: true,
            postFixCovered: true,
            passed: true
        });

        assert.strictEqual(registry.canMarkVerified('ISSUE-002'), true);
    });

    it('should detect scanner findings in dependencies and source', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vuex-helper-scanner-'));
        fs.mkdirSync(path.join(root, 'src'), { recursive: true });
        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
            dependencies: {
                glob: '^8.1.0'
            }
        }));
        fs.writeFileSync(path.join(root, 'src', 'sample.ts'), `
            const cache = new Map();
            const x = require.resolve('x');
        `);

        const registry = new IssueRegistry();
        const scanner = new IssueScanner(root, registry);
        scanner.scanProject();

        const issues = registry.listIssues();
        assert.ok(issues.length >= 2, 'Scanner should report at least dependency and source findings');
    });

    it('should reject bypass test flags and regression baseline breaches', () => {
        const gate = new QualityGate();
        const bypassErrors = gate.validateTestsNoBypass([
            "it.only('x', () => {})",
            "it('ok', () => {})"
        ]);
        assert.strictEqual(bypassErrors.length, 1);

        const perfErrors = gate.validatePerformanceBaselines([
            {
                name: 'indexing',
                baselineMs: 100,
                measuredMs: 130,
                maxRegressionRate: 0.2
            }
        ]);
        assert.strictEqual(perfErrors.length, 1);
    });
});
