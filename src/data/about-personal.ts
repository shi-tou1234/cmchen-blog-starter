export type SiteTimelineItem = {
  date: string;
  content: string[];
};

export type MusicTrack = {
  title: string;
  artist: string;
  url: string;
};

export type TravelProvince = {
  province: string;
  city: string;
  visited: boolean;
  lat?: number;
  lng?: number;
};

export type AboutPersonal = {
  intro: string;
  siteTimeline: SiteTimelineItem[];
  musicTracks: MusicTrack[];
  travelCities: TravelProvince[];
};

const aboutPersonal: AboutPersonal = {
  "intro": "",
  "siteTimeline": [],
  "musicTracks": [],
  "travelCities": []
};

export default aboutPersonal;
