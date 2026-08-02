export const QUEUE_NAME = "reposition";

export type JobName =
  | "ingest:download"
  | "ingest:build"
  | "ingest:full"
  | "score:leg"
  | "recommend:traveler"
  | "collect:opensky"
  | "ml:train";

export interface IngestDownloadData {
  only?: string[];
  skipLive?: boolean;
}

export interface IngestBuildData {
  limit?: number;
}

export interface IngestFullData extends IngestDownloadData, IngestBuildData {}

export interface ScoreLegData {
  icao24: string;
  registration: string;
  typecode: string;
  origin: string;
  destination: string;
  groundTimeHours?: number;
  priorOrigin?: string;
  priorDestination?: string;
  oneWayRatio7d?: number;
  legsLast48h?: number;
  preferPython?: boolean;
}

export interface RecommendTravelerData {
  traveler?: string;
  preferPython?: boolean;
}

export interface CollectOpenSkyData {
  // reserved for bounding-box overrides
}

export interface MlTrainData {
  fromOpenData?: boolean;
  mixSynthetic?: number;
}

export type JobDataMap = {
  "ingest:download": IngestDownloadData;
  "ingest:build": IngestBuildData;
  "ingest:full": IngestFullData;
  "score:leg": ScoreLegData;
  "recommend:traveler": RecommendTravelerData;
  "collect:opensky": CollectOpenSkyData;
  "ml:train": MlTrainData;
};

export interface JobEnqueueRequest {
  name: JobName;
  data?: JobDataMap[JobName];
  /** delay in ms */
  delay?: number;
  attempts?: number;
}
