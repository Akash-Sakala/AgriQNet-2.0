import React, { useState, useEffect } from "react";
import type { Farmer } from "../../types";
import { Modal } from "../../components/Modal";
import { Button } from "../../components/Button";
import { Spinner } from "../../components/Spinner";
import { useAppContext } from "../../App";

export const AddFarmerModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({
  isOpen,
  onClose,
}) => {
  const { districts, addFarmer, addToast } = useAppContext();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [districtId, setDistrictId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName("");
      setPhone("");
      setDistrictId(districts[0]?.id || "");
      setSubmitting(false);
      setError(null);
    }
  }, [isOpen, districts]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name || !phone || !districtId) {
      setError("Please fill out all required fields.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const newFarmer: Omit<Farmer, "id"> = {
      name,
      phone,
      districtId, // IMPORTANT: this is the district *ID*
    };

    try {
      await addFarmer(newFarmer);
      addToast("Farmer added successfully!", "success");
      onClose();
    } catch (err) {
      console.error("ADD FARMER ERROR:", err);
      setError("Failed to add farmer. Please try again.");
      addToast("Failed to add farmer. Please try again.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add New Farmer">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="name"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Full Name
          </label>
          <input
            type="text"
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600"
          />
        </div>

        <div>
          <label
            htmlFor="phone"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Phone Number (E.164)
          </label>
          <input
            type="tel"
            id="phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+919876543210"
            required
            className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600"
          />
        </div>

        <div>
          <label
            htmlFor="farmer-district"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            District
          </label>
          <select
            id="farmer-district"
            value={districtId}
            onChange={(e) => setDistrictId(e.target.value)}
            required
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-brand-green focus:border-brand-green sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600"
          >
            {districts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex justify-end pt-4 space-x-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? <Spinner /> : "Add Farmer"}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
