import React, { useState, useMemo, useEffect } from 'react';
import type { Severity } from '../../types';
import { Modal } from '../../components/Modal';
import { Button } from '../../components/Button';
import { Spinner } from '../../components/Spinner';
import { useAppContext } from '../../App';
import { PEST_TYPES, SEVERITY_CONFIG } from '../../constants';
import { graphService } from '../../services/graphService';
import { apiService } from '../../services/apiService';

export const ReportPestModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { districts, edges, reportAlert, addToast } = useAppContext();

  const [districtId, setDistrictId] = useState<string>('');
  const [severity, setSeverity] = useState<Severity | ''>('');
  const [pestType, setPestType] = useState<string>(PEST_TYPES[0]);

  const [image, setImage] = useState<File | null>(null);
  const [detectedPest, setDetectedPest] = useState<string | null>(null);
  const [detectionConf, setDetectionConf] = useState<number | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [detecting, setDetecting] = useState(false);

  const [error, setError] = useState<string | null>(null);

  // Compute affected districts for preview
  const affectedDistricts = useMemo(() => {
    if (!districtId || !severity) return new Set<string>();
    const depth = SEVERITY_CONFIG[severity].propagationDepth;
    return graphService.bfs(districtId, edges, depth);
  }, [districtId, severity, edges]);

  // Reset when modal opens
  useEffect(() => {
    if (isOpen) {
      setDistrictId(districts[0]?.id || '');
      setSeverity('');
      setPestType(PEST_TYPES[0]);
      setImage(null);
      setDetectedPest(null);
      setDetectionConf(null);
      setSubmitting(false);
      setError(null);
    }
  }, [isOpen, districts]);

  // ------------------------------
  // YOLO DETECTION CALL
  // ------------------------------
  const detectFromImage = async () => {
    if (!image) {
      addToast("Please upload an image first.", "error");
      return;
    }

    setDetecting(true);
    setDetectedPest(null);

    try {
      // YOLO service is reached through the API gateway (/api/pest/detect -> pest-detector:8001)
      const res = await apiService.detectPest(image);

      console.log("📌 RAW Detection Response:", res);

      if (res.pestType) {
        setDetectedPest(res.pestType);
        setDetectionConf(res.confidence);
        setPestType(res.pestType); // Autofill pest type
        if (res.defaultSeverity && !severity) setSeverity(res.defaultSeverity);
        addToast(`Detected: ${res.pestType}`, "success");
      } else {
        addToast("No pest detected.", "error");
      }
    } catch (err: any) {
      addToast(err?.response?.data?.detail || err?.response?.data?.error || "Detection failed.", "error");
    } finally {
      setDetecting(false);
    }
  };

  // ------------------------------
  // SUBMIT ALERT
  // ------------------------------
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!districtId || !severity || !pestType) {
      setError("Please fill all fields.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await reportAlert(districtId, severity, pestType);
      onClose();
    } catch (err) {
      setError("Failed to send alert.");
      addToast("Failed to send alert.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!submitting) onClose();
  };

  const districtMap = useMemo(() => new Map(districts.map(d => [d.id, d.name])), [districts]);

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Report Pest Outbreak">
      <form onSubmit={handleSubmit} className="space-y-4">

        {/* District */}
        <div>
          <label className="block text-sm font-medium">District</label>
          <select
            value={districtId}
            onChange={e => setDistrictId(e.target.value)}
            className="w-full mt-1 border rounded-md dark:bg-gray-700 p-2"
          >
            {districts.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>

        {/* Severity */}
        <div>
          <label className="block text-sm font-medium">Severity</label>
          <select
            value={severity}
            onChange={e => setSeverity(e.target.value as Severity)}
            className="w-full mt-1 border rounded-md dark:bg-gray-700 p-2"
          >
            <option value="" disabled>Select severity...</option>
            {Object.keys(SEVERITY_CONFIG).map(s => (
              <option key={s} value={s}>{SEVERITY_CONFIG[s as Severity].label}</option>
            ))}
          </select>
        </div>

        {/* Pest Type */}
        <div>
          <label className="block text-sm font-medium">Pest Type</label>
          <select
            value={pestType}
            onChange={e => setPestType(e.target.value)}
            className="w-full mt-1 border rounded-md dark:bg-gray-700 p-2"
          >
            {PEST_TYPES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        {/* Image Upload + Preview + Detect */}
        <div>
          <label className="block text-sm font-medium">Upload Pest Image (optional)</label>
          <input
            type="file"
            accept="image/*"
            onChange={e => {
              const file = e.target.files?.[0] || null;
              setImage(file);
              setDetectedPest(null);
              setDetectionConf(null);
            }}
            className="mt-1"
          />

          {/* Preview */}
          {image && (
            <div className="mt-3">
              <p className="text-xs text-gray-500 mb-1">Preview:</p>
              <img
                src={URL.createObjectURL(image)}
                alt="Preview"
                className="h-40 w-auto rounded-md border border-gray-300 shadow-sm"
              />
            </div>
          )}

          {/* Detect button */}
          {image && (
            <Button
              type="button"
              onClick={detectFromImage}
              disabled={detecting}
              className="mt-3"
            >
              {detecting ? <Spinner /> : "Detect Pest"}
            </Button>
          )}

          {/* Detection Result */}
          {detectedPest && (
            <p className="text-green-500 text-sm mt-2">
              Detected: <b>{detectedPest}</b> ({(detectionConf! * 100).toFixed(1)}% confidence)
            </p>
          )}
        </div>

        {/* Errors */}
        {error && <p className="text-red-500 text-sm">{error}</p>}

        {/* Submit */}
        <div className="flex justify-end space-x-2">
          <Button type="button" variant="secondary" onClick={handleClose}>Cancel</Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? <Spinner /> : "Send Alert"}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
