import * as THREE from 'three';

/**
 * Chase-camera pose for the AI-follow camera mode.
 *
 * The camera sits behind and above the aircraft (yaw only, so it never
 * rolls with the plane) and looks ahead of it. The offsets are a little
 * wider than the player's own follow camera (0, 14, -46): the AI aircraft
 * is usually seen from further away, and at 60x en route it covers ~120 m
 * per frame, so the pose is applied directly every frame — any smoothing
 * would trail kilometres behind.
 */
export const AI_FOLLOW_OFFSET = new THREE.Vector3(0, 20, -80);
export const AI_FOLLOW_LOOK = new THREE.Vector3(0, 3, 30);

export interface FollowPose {
  camera: THREE.Vector3;
  target: THREE.Vector3;
}

/** Camera + look target for an aircraft at `position` with scene yaw `yaw`. */
export function aiFollowPose(position: THREE.Vector3, yaw: number): FollowPose {
  const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0, 'YXZ'));
  return {
    camera: AI_FOLLOW_OFFSET.clone().applyQuaternion(quat).add(position),
    target: AI_FOLLOW_LOOK.clone().applyQuaternion(quat).add(position)
  };
}
