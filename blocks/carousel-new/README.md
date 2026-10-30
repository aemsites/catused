# Carousel New

Author a `Carousel New` table with one slide per row:

| Carousel New | |
| --- | --- |
| Image | Optional heading, text, and links |
| Image | Optional heading, text, and links |

A row may contain just an image. Additional text cells are preserved as overlays.
Images fill the slide using `object-fit: cover`; supply meaningful image alt text
when the image conveys information.

The block displays one slide at a time with previous/next arrows and slide dots.
Arrows wrap at either end. Touch and trackpad users can scroll between slides.
When the slide track or a navigation control is focused, Left/Right moves between
slides and Home/End selects the first/last slide. Inactive slides are excluded
from keyboard navigation and the accessibility tree. There is no autoplay, and
navigation respects reduced-motion preferences.

Single-slide blocks omit navigation. No changes to the existing Carousel block
or page scripts are required; the standard block loader loads this block.

Preview authored content at `/drafts/uncled/carousel-test`.
