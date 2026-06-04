const Category = Object.freeze({
    WARE: "ware",
    SCULPTURE: "sculpture",
    PAINTING: "painting",
}) 

const images = [
    { title: "Untitled 07", category: Category.WARE,      filename: "IMG_5459.jpeg" },
    { title: "Untitled 08", category: Category.PAINTING,  filename: "IMG_0527.jpg" },
    { title: "Untitled 09", category: Category.SCULPTURE, filename: "Untitled_Artwork (4).jpg" },
    { title: "Untitled 04", category: Category.SCULPTURE, filename: "Untitled_Artwork (1).JPG" },
    { title: "Untitled 05", category: Category.SCULPTURE, filename: "Untitled_Artwork (2).jpg" },
    { title: "Untitled 06", category: Category.WARE,      filename: "IMG_5442.jpeg" },
    { title: "Untitled 01", category: Category.SCULPTURE, filename: "Untitled_Artwork.jpg" },
    { title: "Untitled 02", category: Category.PAINTING,  filename: "IMG_5993.jpeg" },
    { title: "Untitled 03", category: Category.WARE,      filename: "IMG_5480.jpeg" },
    { title: "Untitled 10", category: Category.WARE,      filename: "IMG_5468.jpeg" },
    { title: "Untitled 11", category: Category.SCULPTURE, filename: "IMG_5576.jpeg" },
    { title: "Untitled 12", category: Category.WARE,      filename: "IMG_5477.jpeg" },
    { title: "Untitled 13", category: Category.PAINTING,  filename: "IMG_0526.jpg" },
    { title: "Untitled 14", category: Category.WARE,      filename: "IMG_5442.jpeg" },
    { title: "Untitled 15", category: Category.SCULPTURE, filename: "Untitled_Artwork.JPG" },
    { title: "Untitled 16", category: Category.WARE,      filename: "IMG_5443.jpeg" },
    { title: "Untitled 17", category: Category.SCULPTURE, filename: "Untitled_Artwork (3).jpg" },
    { title: "Untitled 18", category: Category.WARE,      filename: "IMG_5470.jpeg" },
    { title: "Untitled 19", category: Category.SCULPTURE, filename: "Untitled_Artwork (1).jpg" },
    { title: "Untitled 20", category: Category.PAINTING,  filename: "IMG_5594.jpeg" },
    { title: "Untitled 21", category: Category.SCULPTURE, filename: "Untitled_Artwork (5).jpg" },
]

// POPULATE IMAGE GALLERY
const gallery = document.querySelector(".gallery");

for (let img of images){
    const el = document.createElement("img");
    el.classList = "gallery-item"
    el.alt = img.category + " titled " + img.title;
    el.dataset.category = img.category;
    el.src = "Images/" + img.filename;
    gallery.appendChild(el);
}

// SETUP IMAGE FILTERS
const filters = document.querySelectorAll('.filter');
const items = document.querySelectorAll('.gallery-item');

filters.forEach(filter => {
    filter.addEventListener('click', () => {

        // Update Class List: move 'active' to new filter btn 
        document.querySelector('.filter.active').classList.remove('active');
        filter.classList.add('active');

        // Update Gallery Images
        const category = filter.getAttribute('data-filter');
        console.log(category)

        items.forEach(item => {
            console.log(category)
            console.log(item.getAttribute('data-category'))
            console.log("IS WARE?: ", Category.WARE === "ware");

            if (category === "all" || category == item.getAttribute('data-category')){
                item.classList.remove('hide');
            } else {
                item.classList.add('hide');
            }
        })
    })
})



