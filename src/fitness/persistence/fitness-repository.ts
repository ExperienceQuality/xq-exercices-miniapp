import type {
  FitnessRepository as FoundationRepository,
  LoadedFitnessState as FoundationLoadedState,
} from '../../app/dependencies';
import type { FitnessDocumentV2 } from '../domain/model';

export interface LoadedFitnessState extends FoundationLoadedState {
  readonly document: FitnessDocumentV2;
}

export interface FitnessRepository extends FoundationRepository {
  load(): Promise<LoadedFitnessState>;
  commit(
    expectedRevision: number,
    candidate: FitnessDocumentV2,
  ): Promise<{ readonly storageRevision: number }>;
}
