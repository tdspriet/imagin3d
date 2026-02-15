import { NodeResizer } from 'reactflow'
import { useMoodboardStore } from '../../store/moodboardStore'
import NodeLayerControls from './NodeLayerControls'
import WeightOverlay from './WeightOverlay'
import './ColorPaletteNode.css'

function ColorPaletteNode({ id, data, selected }) {
  const isGenerating = useMoodboardStore((s) => s.isGenerating)
  const colors = data?.colors ?? []

  return (
    <>
      <NodeResizer
        isVisible={selected && !isGenerating}
        minWidth={50}
        minHeight={50}
        lineClassName="node-resizer-line"
        handleClassName="node-resizer-handle"
      />
      <div className="node-frame palette-node-frame">
        <NodeLayerControls id={id} isVisible={selected && !isGenerating} />
        <div className="palette-node">
          <div className="palette-node__stripes">
            {colors.map((color, index) => (
              <div
                key={`${id}-stripe-${index}`}
                className="palette-node__stripe"
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
          <WeightOverlay nodeId={id} weight={data.weight} />
        </div>
      </div>
    </>
  )
}

export default ColorPaletteNode
