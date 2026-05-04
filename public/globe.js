(function () {
  const canvas = document.getElementById('globe-bg');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let W, H, R, cx, cy;
  let rotDeg = 0;
  let last   = null;

  function resize() {
    W  = canvas.width  = window.innerWidth;
    H  = canvas.height = window.innerHeight;
    R  = H * 0.67;   // globe top reaches 1/3 from the top of the viewport
    cx = W / 2;
    cy = H;           // center sits at the bottom edge
  }

  // Orthographic projection with y-axis rotation
  function project(latDeg, lonDeg) {
    const phi   = latDeg * Math.PI / 180;
    const theta = lonDeg * Math.PI / 180;
    return {
      sx: cx + R * Math.cos(phi) * Math.sin(theta),
      sy: cy - R * Math.sin(phi),
      z:       R * Math.cos(phi) * Math.cos(theta), // positive = facing viewer
    };
  }

  // Draw a polyline, dimming the back-facing segments for subtle depth
  function drawLine(pts) {
    let i = 0;
    while (i < pts.length - 1) {
      const front = pts[i].z >= 0;
      ctx.beginPath();
      ctx.moveTo(pts[i].sx, pts[i].sy);
      let j = i;
      while (j < pts.length - 1 && (pts[j].z >= 0) === front) {
        j++;
        ctx.lineTo(pts[j].sx, pts[j].sy);
      }
      ctx.globalAlpha = front ? 0.09 : 0.03;
      ctx.stroke();
      i = j;
    }
    ctx.globalAlpha = 1;
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = '#c4bada'; // muted lavender-grey
    ctx.lineWidth   = 0.65;

    // Latitude rings — equator (0°) up to pole (90°)
    for (let lat = 0; lat <= 90; lat += 18) {
      const pts = [];
      for (let lon = 0; lon <= 360; lon += 3) {
        pts.push(project(lat, lon + rotDeg));
      }
      drawLine(pts);
    }

    // Longitude arcs — upper hemisphere only
    for (let lon = 0; lon < 360; lon += 18) {
      const pts = [];
      for (let lat = 0; lat <= 90; lat += 2) {
        pts.push(project(lat, lon + rotDeg));
      }
      drawLine(pts);
    }
  }

  function tick(ts) {
    if (last !== null) {
      const dt = Math.min(ts - last, 100); // cap to avoid jumps after tab switch
      rotDeg += dt * 0.00075;              // ~360° per 8 minutes
    }
    last = ts;
    draw();
    requestAnimationFrame(tick);
  }

  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(tick);
})();
