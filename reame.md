Create a minimalist online photography exhibition website for the archaeology/art history department photo club “MoMent”.

Project goal:
This site is a permanent online photo exhibition space, not a generic gallery board. It should feel quiet, minimal, and exhibition-like. The design should prioritize the photographs themselves over interface elements or long text.

Overall concept:

* The website represents “MoMent”, an archaeology/art history department photo fieldwork club.
* The atmosphere should be restrained, static, and elegant rather than commercial or flashy.
* Text should be minimized.
* The site should work well on both desktop and mobile.
* Only one administrator should be able to upload, edit, and delete photos through an admin interface.

1. Intro screen
   When a user first enters the site, show centered text in two lines:

MoMent
고고미술사학과 사진답사동아리

Requirements:

* Both lines must be center-aligned.
* “MoMent” should appear large.
* “고고미술사학과 사진답사동아리” should appear smaller underneath.
* This intro should remain briefly, then fade out naturally after 2 seconds.
* After the fade-out, the photo exhibition should be revealed.
* This is not a separate landing page, but an intro animation/transition.

2. Main exhibition layout
   After the intro disappears, the main page should immediately show the photo exhibition.
   Photos should be arranged vertically in a natural scrolling layout.

Responsive behavior:

* On mobile, each photo should fill the available screen width.
* On desktop, each photo should display at its original size.
* The structure should prioritize the photographs themselves over menus or explanatory sections.

3. Photo interaction behavior
   Desktop behavior:
   When the user hovers over a photo:

* That photo should become visually emphasized.
* All other photos should become more transparent/dimmed.
* Only under the hovered photo, the photo metadata should appear.

Displayed metadata:

* date
* location
* photographer
* copyright

Default state:

* Metadata should normally remain hidden.
* Metadata appears only during interaction, so the interface stays visually clean.

Mobile behavior:
Because hover does not exist on mobile:

* Tapping a photo should reveal that photo’s metadata.
* Tapping another photo should switch the metadata to that photo.
* The mobile interaction should preserve the same clean exhibition feeling as desktop.

4. Admin permissions
   The site must support one-admin-only content management.

Requirements:

* Visitors can only view photos.
* Visitors cannot upload or edit anything.
* Only one administrator can log in and manage content.
* The administrator must be able to upload, edit, and delete photos and their metadata.
* The admin interface should be accessible via a separate button placed at the very bottom of the site.

5. Required features
   Build the initial version with these features:

* Intro text screen with fade-out after 2 seconds
* Vertical photo exhibition layout
* Desktop hover interaction
* Mobile tap interaction
* Metadata display for each photo:

  * date
  * location
  * photographer
  * copyright
* Admin login
* One-admin-only upload/edit/delete functionality
* Fully responsive design for desktop and mobile

6. Design direction
   Design principles:

* minimalist
* quiet
* exhibition-like
* generous spacing
* restrained typography
* no flashy colors or decorative effects
* photos should dominate the visual hierarchy

Avoid:

* busy navigation
* commercial gallery styling
* excessive text blocks
* heavy ornamentation

7. Technical expectations
   Please build this as a maintainable web app with:

* a public exhibition page
* an admin login and admin management page
* support for image upload plus metadata editing
* clean responsive behavior across screen sizes

Use a stack that is practical for a small self-managed project.
The administrator should not need to manually edit code in order to update photos later.

8. Deliverable expectation
   Please generate:

* the full project structure
* the main public-facing exhibition page
* the intro animation
* the hover/tap interaction behavior
* the admin login flow
* the admin content management interface
* a simple and clear way to store photo metadata

Also make reasonable implementation decisions where needed, as long as they follow the design and behavior described above. / Use clean production-ready code and explain the file structure briefly after generating it. 