// UNIT-ISOLATION ONLY. The fail-closed completeness authority (creation-completeness.ts) is
// replaced by this stub in a MECHANICS test file, so that the file exercises one subsystem (choice
// answering, feat routing, progression arithmetic, a Builder presentation primitive) without the
// global "can this real character complete" question.
//
// A file that uses this stub must NOT make a claim that a real PHB character can be created or can
// progress. Such claims belong in a production-path acceptance file, which uses the REAL authority.
// The policy is enforced by tests/rules/completeness-stub-policy.test.ts, which lists every file
// allowed to stub, and fails if a file stubs without being listed, or if an acceptance file stubs.
export const MECHANICS_ONLY_COMPLETENESS = {
  creationUnresolvedDecisions: () => [],
  progressionUnresolvedDecisions: () => []
}
