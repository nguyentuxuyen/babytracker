import { ChangelogRelease } from '../types';
import changelogSeed from '../config/changelogSeed.json';

export const CHANGELOG_SEEN_STORAGE_KEY = 'babytracker.seenChangelogVersions';

export const fallbackChangelogReleases: ChangelogRelease[] = changelogSeed.releases.map((release) => ({
  version: release.version,
  releasedAt: new Date(release.releasedAt),
  title: release.title,
  summary: release.summary,
  changes: release.changes,
  isPublished: release.isPublished
}));

export const formatChangelogDate = (value: Date): string => {
  return value.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
};
