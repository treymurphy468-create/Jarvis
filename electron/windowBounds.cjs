function bottomRightBounds(workArea, width, height, margin = 20) {
  const area = workArea || { x: 0, y: 0, width: 0, height: 0 };
  return {
    x: Math.round((area.x || 0) + (area.width || 0) - width - margin),
    y: Math.round((area.y || 0) + (area.height || 0) - height - margin),
    width,
    height,
  };
}

function placeJarvisWindows(workArea, {
  companionWidth = 320,
  companionHeight = 420,
  artifactWidth = 520,
  artifactHeight = 640,
  margin = 20,
} = {}) {
  const companion = bottomRightBounds(workArea, companionWidth, companionHeight, margin);
  const artifact = {
    width: artifactWidth,
    height: artifactHeight,
    x: Math.max(workArea.x || 0, companion.x - artifactWidth - margin),
    y: Math.round((workArea.y || 0) + (workArea.height || 0) - artifactHeight - margin),
  };
  return { companion, artifact };
}

module.exports = { bottomRightBounds, placeJarvisWindows };
