import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  removeNSPrefix: true,
  trimValues: true,
  isArray: (name) => ['organization', 'item', 'resource', 'file', 'dependency'].includes(name),
});

const text = (v) => (v == null ? '' : typeof v === 'object' ? (v['#text'] ?? '') : String(v));

/** Parse an imsmanifest.xml string into a normalised structure the LMS can store. */
export function parseManifest(xml) {
  if (!xml || !xml.includes('<manifest')) throw new Error('imsmanifest.xml is missing a <manifest> root element');
  const doc = parser.parse(xml);
  const manifest = doc.manifest === '' ? {} : doc.manifest;
  if (manifest == null) throw new Error('Invalid imsmanifest.xml: no <manifest> element');

  const schemaVersion = text(manifest.metadata?.schemaversion);
  const schema = text(manifest.metadata?.schema);
  const raw = xml.toLowerCase();
  let version = '1.2';
  if (/2004|cam\s*1\.3/.test(schemaVersion.toLowerCase()) || raw.includes('adlcp_v1p3') || raw.includes('imsss') || raw.includes('scormtype=')) {
    // adlcp:scormType (camel-case T) is 2004; adlcp:scormtype is 1.2 - both compare lowercase, so rely on namespace too
    version = raw.includes('adlcp_rootv1p2') && !raw.includes('adlcp_v1p3') && !/2004/.test(schemaVersion) ? '1.2' : '2004';
  }

  const resources = (manifest.resources?.resource || []).map((r) => ({
    identifier: r['@identifier'],
    type: r['@type'],
    scormType: r['@scormType'] || r['@scormtype'] || '',
    href: r['@href'] || '',
    base: r['@base'] || '',
    files: (r.file || []).map((f) => f['@href']).filter(Boolean),
  }));
  const resourcesBase = manifest.resources?.['@base'] || '';
  const byId = Object.fromEntries(resources.map((r) => [r.identifier, r]));

  const orgs = manifest.organizations?.organization || [];
  const defaultOrgId = manifest.organizations?.['@default'];
  const org = orgs.find((o) => o['@identifier'] === defaultOrgId) || orgs[0];
  if (!org) throw new Error('Invalid imsmanifest.xml: no <organization> found');

  const items = [];
  const walk = (list, depth, parentId) => {
    for (const it of list || []) {
      const res = it['@identifierref'] ? byId[it['@identifierref']] : null;
      const entry = {
        identifier: it['@identifier'],
        title: text(it.title) || it['@identifier'],
        depth,
        parent: parentId,
        resourceId: it['@identifierref'] || null,
        href: res ? joinPath(resourcesBase, res.base, res.href) : null,
        parameters: it['@parameters'] || '',
        scormType: res?.scormType || '',
        masteryScore: it.masteryscore != null ? Number(text(it.masteryscore)) : (it.masteryScore != null ? Number(text(it.masteryScore)) : null),
        dataFromLms: text(it.dataFromLMS ?? it.datafromlms ?? ''),
        maxTimeAllowed: text(it.maxtimeallowed ?? it.timeLimitAction ?? ''),
        completionThreshold: it.completionThreshold ? Number(it.completionThreshold['@minProgressMeasure'] ?? text(it.completionThreshold)) : null,
        scaledPassingScore: it.sequencing?.objectives?.primaryObjective?.minNormalizedMeasure != null
          ? Number(text(it.sequencing.objectives.primaryObjective.minNormalizedMeasure)) : null,
      };
      items.push(entry);
      walk(it.item, depth + 1, entry.identifier);
    }
  };
  walk(org.item, 0, null);

  const launchable = items.filter((i) => i.href);
  if (!launchable.length) throw new Error('No launchable item (item with identifierref -> resource href) found in manifest');
  const first = launchable[0];

  return {
    version,
    schema,
    schemaVersion,
    identifier: manifest['@identifier'] || '',
    title: text(org.title) || text(manifest.metadata?.title) || first.title,
    organizationId: org['@identifier'],
    launchPath: first.href + (first.parameters || ''),
    masteryScore: first.masteryScore ?? (first.scaledPassingScore != null ? first.scaledPassingScore * 100 : null),
    items,
    resources,
  };
}

function joinPath(...parts) {
  return parts.filter(Boolean).map((p, i, arr) => (i < arr.length - 1 ? p.replace(/\/+$/, '') + '/' : p)).join('').replace(/^\.\//, '');
}
