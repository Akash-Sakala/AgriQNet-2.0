import React from 'react';
import { useAppContext } from '../App';
import type { District, Edge } from '../types';
import { Card } from '../components/Card';

const DistrictNode: React.FC<{ district: District }> = ({ district }) => (
  <div
    className="absolute flex flex-col items-center justify-center w-28 h-28 bg-brand-green-light text-white rounded-full shadow-lg transform -translate-x-1/2 -translate-y-1/2 p-2 text-center"
    style={{ left: `${district.position.x}%`, top: `${district.position.y}%` }}
  >
    <span className="font-bold text-sm leading-tight">{district.name}</span>
    <span className="text-xs opacity-80 mt-1">{district.id}</span>
  </div>
);

const EdgeLine: React.FC<{ from: District; to: District }> = ({ from, to }) => {
  if (!from || !to) return null;
  const x1 = from.position.x;
  const y1 = from.position.y;
  const x2 = to.position.x;
  const y2 = to.position.y;

  return (
    <line
      x1={`${x1}%`}
      y1={`${y1}%`}
      x2={`${x2}%`}
      y2={`${y2}%`}
      className="stroke-current text-gray-300 dark:text-gray-600"
      strokeWidth="2"
    />
  );
};

const DistrictGraph: React.FC<{ districts: District[]; edges: Edge[] }> = ({ districts, edges }) => {
  const districtMap = new Map(districts.map(d => [d.id, d]));

  return (
    <div className="relative w-full h-[800px] bg-gray-50 dark:bg-gray-700 rounded-lg overflow-hidden">
      <svg className="absolute inset-0 w-full h-full">
        {edges.map((edge, index) => (
          <EdgeLine
            key={index}
            from={districtMap.get(edge.districtAId)!}
            to={districtMap.get(edge.districtBId)!}
          />
        ))}
      </svg>
      {districts.map(district => (
        <DistrictNode key={district.id} district={district} />
      ))}
    </div>
  );
};


const DistrictsPage: React.FC = () => {
    const { districts, edges } = useAppContext();
    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-200">District Topology</h1>
            <Card>
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                    This map shows the districts and their direct connections. Alerts propagate from a reported district to its neighbors based on severity.
                </p>
                <DistrictGraph districts={districts} edges={edges} />
            </Card>
        </div>
    );
};

export default DistrictsPage;
