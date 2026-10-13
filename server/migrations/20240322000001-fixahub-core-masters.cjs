'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // 1. Roles
    await queryInterface.createTable('Roles', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      role_name: { type: Sequelize.STRING, unique: true, allowNull: false },
      role_description: { type: Sequelize.TEXT },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });

    // 2. Property Types
    await queryInterface.createTable('PropertyTypes', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      type_name: { type: Sequelize.STRING, allowNull: false },
      description: { type: Sequelize.TEXT },
      status: { type: Sequelize.ENUM('ACTIVE', 'INACTIVE'), defaultValue: 'ACTIVE' },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });

    // 3. Asset Categories
    await queryInterface.createTable('AssetCategories', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      category_name: { type: Sequelize.STRING, allowNull: false },
      category_description: { type: Sequelize.TEXT },
      parent_id: { type: Sequelize.INTEGER, references: { model: 'AssetCategories', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      status: { type: Sequelize.ENUM('ACTIVE', 'INACTIVE'), defaultValue: 'ACTIVE' },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });

    // 4. Asset Statuses
    await queryInterface.createTable('AssetStatuses', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      status_name: { type: Sequelize.STRING, allowNull: false },
      status_color: { type: Sequelize.STRING(7) },
      description: { type: Sequelize.TEXT },
      display_order: { type: Sequelize.INTEGER },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });

    // 5. Maintenance Types
    await queryInterface.createTable('MaintenanceTypes', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      type_name: { type: Sequelize.STRING, allowNull: false },
      description: { type: Sequelize.TEXT },
      status: { type: Sequelize.ENUM('ACTIVE', 'INACTIVE'), defaultValue: 'ACTIVE' },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });

    // 6. Departments
    await queryInterface.createTable('Departments', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      dept_name: { type: Sequelize.STRING, allowNull: false },
      dept_code: { type: Sequelize.STRING, unique: true, allowNull: false },
      description: { type: Sequelize.TEXT },
      status: { type: Sequelize.ENUM('ACTIVE', 'INACTIVE'), defaultValue: 'ACTIVE' },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });

    // 7. Regions
    await queryInterface.createTable('Regions', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      region_name: { type: Sequelize.STRING, allowNull: false },
      region_code: { type: Sequelize.STRING, unique: true, allowNull: false },
      country: { type: Sequelize.STRING },
      description: { type: Sequelize.TEXT },
      status: { type: Sequelize.ENUM('ACTIVE', 'INACTIVE'), defaultValue: 'ACTIVE' },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });

    // 8. Service Providers
    await queryInterface.createTable('ServiceProviders', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      provider_name: { type: Sequelize.STRING, allowNull: false },
      contact_person: { type: Sequelize.STRING, allowNull: false },
      phone: { type: Sequelize.STRING(20), allowNull: false },
      email: { type: Sequelize.STRING, allowNull: false },
      address: { type: Sequelize.TEXT },
      services_offered: { type: Sequelize.TEXT },
      gst_number: { type: Sequelize.STRING(20) },
      pan_number: { type: Sequelize.STRING(20) },
      status: { type: Sequelize.ENUM('ACTIVE', 'INACTIVE'), defaultValue: 'ACTIVE' },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });

    // 9. Sub-Departments (Dep on Dept)
    await queryInterface.createTable('SubDepartments', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      sub_dept_name: { type: Sequelize.STRING, allowNull: false },
      department_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Departments', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      description: { type: Sequelize.TEXT },
      status: { type: Sequelize.ENUM('ACTIVE', 'INACTIVE'), defaultValue: 'ACTIVE' },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });

    // 10. Properties (Dep on PropertyTypes, Regions, etc.)
    await queryInterface.createTable('Properties', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      property_name: { type: Sequelize.STRING, allowNull: false },
      property_type_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'PropertyTypes', key: 'id' } },
      building_block: { type: Sequelize.STRING },
      address: { type: Sequelize.TEXT },
      region_id: { type: Sequelize.INTEGER, references: { model: 'Regions', key: 'id' } },
      description: { type: Sequelize.TEXT },
      status: { type: Sequelize.ENUM('ACTIVE', 'INACTIVE'), defaultValue: 'ACTIVE' },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });

    // 11. Locations (Dep on Regions, Properties)
    await queryInterface.createTable('Locations', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      location_name: { type: Sequelize.STRING, allowNull: false },
      location_code: { type: Sequelize.STRING, unique: true, allowNull: false },
      region_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Regions', key: 'id' } },
      property_id: { type: Sequelize.INTEGER, references: { model: 'Properties', key: 'id' } },
      full_address: { type: Sequelize.TEXT },
      pincode: { type: Sequelize.STRING(10) },
      status: { type: Sequelize.ENUM('ACTIVE', 'INACTIVE'), defaultValue: 'ACTIVE' },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });

    // 12. Asset Sub Categories (Dep on Categories)
    await queryInterface.createTable('AssetSubCategories', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      sub_category_name: { type: Sequelize.STRING, allowNull: false },
      category_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'AssetCategories', key: 'id' } },
      description: { type: Sequelize.TEXT },
      status: { type: Sequelize.ENUM('ACTIVE', 'INACTIVE'), defaultValue: 'ACTIVE' },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });

    // 13. Entities (referenced in spec seed data but missing in table list? I'll add it for robustness)
    await queryInterface.createTable('Entities', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      entity_name: { type: Sequelize.STRING, allowNull: false },
      entity_code: { type: Sequelize.STRING, unique: true },
      address: { type: Sequelize.TEXT },
      gst_number: { type: Sequelize.STRING },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });

    // 14. Users (Dep on Roles, Entities)
    await queryInterface.createTable('Users', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      first_name: { type: Sequelize.STRING, allowNull: false },
      last_name: { type: Sequelize.STRING, allowNull: false },
      email: { type: Sequelize.STRING, unique: true, allowNull: false },
      employee_id: { type: Sequelize.STRING, unique: true, allowNull: false },
      username: { type: Sequelize.STRING, unique: true, allowNull: false }, // Added username for login
      password_hash: { type: Sequelize.STRING, allowNull: false },
      role_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Roles', key: 'id' } },
      entity_id: { type: Sequelize.INTEGER, references: { model: 'Entities', key: 'id' } },
      user_level: { type: Sequelize.ENUM('Level 1', 'Level 2', 'Level 3', 'Level 4'), defaultValue: 'Level 1' },
      status: { type: Sequelize.ENUM('ACTIVE', 'INACTIVE'), defaultValue: 'ACTIVE' },
      last_login: { type: Sequelize.DATE },
      refresh_token_hash: { type: Sequelize.STRING },
      failed_login_attempts: { type: Sequelize.INTEGER, defaultValue: 0 },
      locked_until: { type: Sequelize.DATE },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });

    // 15. Role Permissions
    await queryInterface.createTable('RolePermissions', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      role_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Roles', key: 'id' } },
      section: { type: Sequelize.STRING, allowNull: false },
      can_add: { type: Sequelize.BOOLEAN, defaultValue: false },
      can_edit: { type: Sequelize.BOOLEAN, defaultValue: false },
      can_delete: { type: Sequelize.BOOLEAN, defaultValue: false },
      can_view: { type: Sequelize.BOOLEAN, defaultValue: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.addConstraint('RolePermissions', {
      fields: ['role_id', 'section'],
      type: 'unique',
      name: 'unique_role_section'
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.dropTable('RolePermissions');
    await queryInterface.dropTable('Users');
    await queryInterface.dropTable('Entities');
    await queryInterface.dropTable('AssetSubCategories');
    await queryInterface.dropTable('Locations');
    await queryInterface.dropTable('Properties');
    await queryInterface.dropTable('SubDepartments');
    await queryInterface.dropTable('ServiceProviders');
    await queryInterface.dropTable('Regions');
    await queryInterface.dropTable('Departments');
    await queryInterface.dropTable('MaintenanceTypes');
    await queryInterface.dropTable('AssetStatuses');
    await queryInterface.dropTable('AssetCategories');
    await queryInterface.dropTable('PropertyTypes');
    await queryInterface.dropTable('Roles');
  }
};
