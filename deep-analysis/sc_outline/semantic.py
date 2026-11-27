"""Optional prompted mask backend. No network downloads or implicit model loading.
Install segment-anything and torch separately; provide your own checkpoint.
"""
import numpy as np

class SAMProvider:
    def __init__(self, checkpoint, model_type='vit_b', device='cpu'):
        from segment_anything import sam_model_registry, SamPredictor
        self.predictor=SamPredictor(sam_model_registry[model_type](checkpoint=checkpoint).to(device=device))
        self._image=None
    def __call__(self, rgb, hint_mask, item):
        if self._image is not rgb:
            self.predictor.set_image(rgb);self._image=rgb
        y,x=np.nonzero(hint_mask); box=np.array([x.min(),y.min(),x.max(),y.max()],dtype=float)
        masks,scores,_=self.predictor.predict(box=box,multimask_output=True)
        hint=hint_mask>0
        def overlap(m):return np.count_nonzero(m&hint)/max(1,np.count_nonzero(m|hint))
        best=max(range(len(masks)),key=lambda i:overlap(masks[i])+.1*float(scores[i]))
        return masks[best].astype(np.uint8)*255
