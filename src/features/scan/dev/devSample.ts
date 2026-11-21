import { Asset } from 'expo-asset';

/** DEVELOPMENT ONLY (QN_DEV_ONLY_SAMPLE_PHOTO): the sample plate the browser preview uses in place of the camera. */
export const DEV_SAMPLE_PHOTO: string = Asset.fromModule(require('../../../../assets/images/sample-meal.jpg')).uri;
