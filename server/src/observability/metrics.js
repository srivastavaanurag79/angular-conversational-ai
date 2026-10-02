const BUCKETS = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10];

const counters = new Map();
const observations = new Map();
const gauges = new Map();

function labelKey(name, labels = {}) {
  const parts = Object.keys(labels)
    .sort()
    .map((key) => `${key}="${String(labels[key]).replace(/"/g, "'")}"`);
  return parts.length ? `${name}{${parts.join(",")}}` : name;
}

function increment(name, labels = {}, value = 1) {
  const key = labelKey(name, labels);
  const current = counters.get(key) || { name, labels, value: 0 };
  current.value += value;
  counters.set(key, current);
}

function setGauge(name, value, labels = {}) {
  gauges.set(labelKey(name, labels), { name, labels, value });
}

function observe(name, value, labels = {}) {
  const key = labelKey(name, labels);
  const current = observations.get(key) || {
    name,
    labels,
    count: 0,
    sum: 0,
    buckets: BUCKETS.map((bound) => ({ bound, count: 0 }))
  };

  current.count += 1;
  current.sum += value;
  for (const bucket of current.buckets) {
    if (value <= bucket.bound) bucket.count += 1;
  }
  observations.set(key, current);
}

function renderPrometheus() {
  const lines = [];

  for (const { name, labels, value } of counters.values()) {
    lines.push(`${labelKey(name, labels)} ${value}`);
  }

  for (const { name, labels, count, sum, buckets } of observations.values()) {
    for (const bucket of buckets) {
      lines.push(`${labelKey(`${name}_bucket`, { ...labels, le: bucket.bound })} ${bucket.count}`);
    }
    lines.push(`${labelKey(`${name}_bucket`, { ...labels, le: "+Inf" })} ${count}`);
    lines.push(`${labelKey(`${name}_sum`, labels)} ${sum}`);
    lines.push(`${labelKey(`${name}_count`, labels)} ${count}`);
  }

  for (const { name, labels, value } of gauges.values()) {
    lines.push(`${labelKey(name, labels)} ${value}`);
  }

  return lines.length ? `${lines.join("\n")}\n` : "";
}

function snapshot() {
  return {
    counters: [...counters.values()],
    observations: [...observations.values()],
    gauges: [...gauges.values()]
  };
}

function reset() {
  counters.clear();
  observations.clear();
  gauges.clear();
}

module.exports = { increment, observe, setGauge, renderPrometheus, snapshot, reset };
