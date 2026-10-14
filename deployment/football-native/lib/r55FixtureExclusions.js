// Explicit user exclusions. Do NOT reject a whole country or competition.
// No match-specific opt-out was authorized: all valid AH/O-U odds fixtures remain in scope.
const ignoredFixtureIds = new Set();
export function isR55IgnoredFixture(fixture){
  if(!fixture || typeof fixture !== "object")return false;
  const sourceId=fixture.bongdaluId ?? fixture.id;
  const id=String(sourceId ?? "").replace(/^BDL_/i,"");
  return ignoredFixtureIds.has(id);
}
