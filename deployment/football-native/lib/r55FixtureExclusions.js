// Explicit user exclusions. Do NOT reject a whole country or competition.
const ignoredFixtureIds = new Set(["3102824", "3102993"]);
export function isR55IgnoredFixture(fixture){
  if(!fixture || typeof fixture !== "object")return false;
  const sourceId=fixture.bongdaluId ?? fixture.id;
  const id=String(sourceId ?? "").replace(/^BDL_/i,"");
  return ignoredFixtureIds.has(id);
}
