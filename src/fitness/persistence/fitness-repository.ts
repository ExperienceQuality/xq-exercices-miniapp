import type {
  FitnessRepository as FoundationRepository,
  LoadedFitnessState as FoundationLoadedState,
} from '../../app/dependencies';
import type { FitnessDocumentV2 } from '../domain/model';
import type { FitnessMutation } from '../domain/mutations';

export interface LoadedFitnessState extends FoundationLoadedState {
  readonly document: FitnessDocumentV2;
}

export interface FitnessRepository extends FoundationRepository {
  load(): Promise<LoadedFitnessState>;
  apply(
    expectedRevision: number,
    mutation: FitnessMutation,
  ): Promise<{ readonly storageRevision: number }>;
}
