const Sequelize = require("sequelize");
const {models} = require("../models");

const paginate = require('../helpers/paginate').paginate;

// Autoload el quiz asociado a :groupId
exports.load = async (req, res, next, groupId) => {

    try {
        const group = await models.Group.findByPk(groupId);
        console.log(group);
        if (group) {
            req.load = {...req.load, group};
            //Lineas agregadas para efectos de depuración y validación del funcionamiento del autoload
            //req.flash('success', 'Se realizó autoload del Grupo=' + groupId + '.');
            next();
        } else {
            req.flash('error', 'There is no group with id=' + groupId + '.');
            throw new Error('There is no group with id=' + groupId);
        }
    } catch (error) {
        next(error);
    }
};

// GET /groups
exports.index = async (req, res, next) => {

    try {
       

    /*  ///VERSIÓN CON PAGINACIÓN
        const count = await models.Group.count();

        // Pagination:
        const items_per_page = 10;

        // The page to show is given in the query
        const pageno = parseInt(req.query.pageno) || 1;

        // Create a String with the HTMl used to render the pagination buttons.
        // This String is added to a local variable of res, which is used into the application layout file.
        res.locals.paginate_control = paginate(count, items_per_page, pageno, req.url);

        
        const findOptions = {
            offset: items_per_page * (pageno - 1),
            limit: items_per_page,
            order: ['name']
        };

        const groups = await models.Group.findAll(findOptions);

    */
        //VERSION SIN PAGINACIÓN
        const groups = await models.Group.findAll();

        res.render('groups/index', {groups});
    } catch (error) {
        next(error);
    }
};

// GET /groups/new
exports.new = async (req, res, next) => {

    const group = {name: ""};

    res.render('groups/new', {group});

};


// POST /groups/create
exports.create = async (req, res, next) => {
    const {name} = req.body;

    let group = models.Group.build({
        name
    });

    try {
        // Saves only the field name into the DDBB
        group = await group.save({fields:["name"]});
        req.flash('success', 'Group created successfully.');
        res.redirect('/groups');
    }catch (error) {
        if (error instanceof Sequelize.ValidationError) {
            req.flash('error', 'There are errors in the form:');
            error.errors.forEach(({message}) => req.flash('error', message));
            res.render('groups/new', {group});
        } else {
            req.flash('error', 'Error creating a new Quiz: ' + error.message);
            next(error);
        }
    }

};

// GET /groups/:groupId/edit
exports.edit = async (req, res, next) => {

    const {group} = req.load;

    const allQuizzes = await models.Quiz.findAll();
    //getQuizzes() es un método asociado a group dada la relación entre group y quizzes
    const groupQuizzesIds = await group.getQuizzes().map(quiz => quiz.id);
    res.render('groups/edit', {group, allQuizzes, groupQuizzesIds});

};

// PUT /groups/:groupId/
exports.update = async (req, res, next) => {

    const {group} = req.load;

    const {name, quizzesIds = []} = req.body;

    group.name = name.trim();

    try {
        //Salva el nuevo nombre de Grupo
        await group.save({fields: ["name"]});
        //Hace set a los id de los Quizzes pertenecientes al Grupo en la relación N a N que está definida en su modelo
        // con esto se actualizan los quizzes que pertenecen al grupo
        await group.setQuizzes(quizzesIds);
        
        req.flash('success', 'Group edited successfully.');
        res.redirect('/groups');
    } catch (error) {
        if (error instanceof Sequelize.ValidationError) {
            req.flash('error', 'There are errors in the form:');
            error.errors.forEach(({message}) => req.flash('error', message));

            //debo pasarle todos los quizzes porque lo necesita para renderizar la vista edit
            const allQuizzes = await models.Quiz.findAll();

            //Renderizo nuevamente la vista edit //groupQuizzesIds es el nombre adecuado para que lo reciba la vista
            res.render('groups/edit', {group, allQuizzes, groupQuizzesIds: quizzesIds});

        } else {
            req.flash('error', 'Error editing the Group: ' + error.message);
            next(error);
        }
    }


};

exports.destroy = async (req, res, next) => {
    try {
        await req.load.group.destroy();
        req.flash('success', 'Group deleted successfully.');
        res.redirect('/goback');
    } catch (error) {
        req.flash('error', 'Error deleting the Group: ' + error.message);
        next(error);
    }

};

//GET /groups/:groupId/randomplay
exports.randomPlay = async (req, res, next) => {

    const group = req.load.group;

    req.session.groupPlay = req.session.groupPlay || {};
    req.session.groupPlay[group.id] = req.session.groupPlay[group.id] || { lastQuizId: 0 , resolved : [] };
    

    //console.log(req.session.randomPlayResolved);

    try {

    let quiz;
    
    if(req.session.groupPlay[group.id].lastQuizId){

        quiz = await models.Quiz.findByPk(req.session.groupPlay[group.id].lastQuizId);
    } else{

        const total = await group.countQuizzes();
        console.log("La cantidad de quizes son: " + total);

        const quedan = total - req.session.groupPlay[group.id].resolved.length;

        console.log("La cantidad de quizes que quedan por resolver son: " + quedan);

        quiz = await models.Quiz.findOne({
            where: {'id': {[Sequelize.Op.notIn]: req.session.groupPlay[group.id].resolved}},
            include: [
                {  
                    model: models.Group, 
                    as:"groups",
                    where: {id: group.id}
                }
            ],
            offset: Math.floor(Math.random() * quedan)
        });
    }


    const score = req.session.groupPlay[group.id].resolved.length;

    if(quiz){
        req.session.groupPlay[group.id].lastQuizId = quiz.id;
        res.render('groups/random_play', {group, quiz, score});   //REVISAR EL RES RENDER
    } else {
        delete req.session.groupPlay[group.id];
        res.render('groups/random_nomore', {group, score});
    }

    } catch (error){
        next(error);
    }
};

//GET /groups/:groupId/randomcheck/:quizId(\d+)
exports.randomCheck = async (req, res, next) => {

    const group = req.load.group;

    req.session.groupPlay = req.session.groupPlay || {};
    req.session.groupPlay[group.id] = req.session.groupPlay[group.id] || { lastQuizId:0 , resolved : [] };

    const answer = req.query.answer || "";
    const result = answer.toLowerCase().trim() === req.load.quiz.answer.toLowerCase().trim();

    if(result){
        if(req.session.groupPlay[group.id].resolved.indexOf(req.load.quiz.id) === -1 ){
            req.session.groupPlay[group.id].resolved.push(req.load.quiz.id);
        }
        
        const score = req.session.groupPlay[group.id].resolved.length;

        req.session.groupPlay[group.id].lastQuizId = 0;

        res.render('groups/random_result',{group, score, answer, result}); //REVISAR EL RES RENDER

    }else {
        
        const score = req.session.groupPlay[group.id].resolved.length;
        delete req.session.groupPlay[group.id];
        res.render('groups/random_result', {group, score, answer, result});   //REVISAR EL RES RENDER
    }
}